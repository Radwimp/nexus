use anyhow::Result;
use redis::aio::MultiplexedConnection;
use redis::streams::{StreamId, StreamReadOptions, StreamReadReply};
use redis::{AsyncCommands, Client};
use tokio::sync::mpsc;
use tracing::{error, info, warn};

use crate::types::*;

const ORDERS_STREAM: &str = "orders:incoming";
const CANCEL_STREAM: &str = "orders:cancel";
const TRADES_STREAM: &str = "trades:executed";
const ORDER_STATUS_STREAM: &str = "orders:status";
const CONSUMER_GROUP: &str = "engine";
const CONSUMER_NAME: &str = "engine-0";

/// Redis transport — handles all I/O between Redis and the engine channels.
pub struct Transport {
    client: Client,
}

impl Transport {
    pub fn new(redis_url: &str) -> Result<Self> {
        let client = Client::open(redis_url)?;
        Ok(Self { client })
    }

    /// Initialize Redis consumer groups (idempotent).
    async fn ensure_consumer_groups(&self, conn: &mut MultiplexedConnection) -> Result<()> {
        for stream in &[ORDERS_STREAM, CANCEL_STREAM] {
            // Create stream + consumer group, ignore if already exists
            let result: Result<(), redis::RedisError> = redis::cmd("XGROUP")
                .arg("CREATE")
                .arg(stream)
                .arg(CONSUMER_GROUP)
                .arg("$")
                .arg("MKSTREAM")
                .query_async(conn)
                .await;

            match result {
                Ok(_) => info!("Created consumer group for {}", stream),
                Err(e) if e.to_string().contains("BUSYGROUP") => {
                    info!("Consumer group already exists for {}", stream);
                }
                Err(e) => return Err(e.into()),
            }
        }
        Ok(())
    }

    /// Run the inbound consumer — reads from Redis streams and sends to engine channel.
    pub async fn run_inbound(
        &self,
        cmd_tx: mpsc::Sender<EngineCommand>,
    ) -> Result<()> {
        let mut conn = self.client.get_multiplexed_async_connection().await?;
        self.ensure_consumer_groups(&mut conn).await?;

        info!("Inbound transport started");

        let opts = StreamReadOptions::default()
            .group(CONSUMER_GROUP, CONSUMER_NAME)
            .count(100)
            .block(1000);

        let mut retry_delay = tokio::time::Duration::from_secs(1);

        loop {
            let reply: StreamReadReply = match conn
                .xread_options(&[ORDERS_STREAM, CANCEL_STREAM], &[">", ">"], &opts)
                .await
            {
                Ok(r) => {
                    retry_delay = tokio::time::Duration::from_secs(1);
                    r
                }
                Err(e) => {
                    error!("Redis read error: {} (retrying in {:?})", e, retry_delay);
                    tokio::time::sleep(retry_delay).await;
                    retry_delay = (retry_delay * 2).min(tokio::time::Duration::from_secs(30));
                    continue;
                }
            };

            for stream_key in &reply.keys {
                for msg in &stream_key.ids {
                    let result = match stream_key.key.as_str() {
                        ORDERS_STREAM => parse_order_command(msg),
                        CANCEL_STREAM => parse_cancel_command(msg),
                        _ => {
                            warn!("Unknown stream: {}", stream_key.key);
                            continue;
                        }
                    };

                    match result {
                        Ok(cmd) => {
                            if cmd_tx.send(cmd).await.is_err() {
                                error!("Engine channel closed");
                                return Ok(());
                            }
                            // ACK only after successful send to engine
                            let _: Result<i64, _> = conn
                                .xack(&stream_key.key, CONSUMER_GROUP, &[&msg.id])
                                .await;
                        }
                        Err(e) => {
                            warn!("Failed to parse command (id={}): {}", msg.id, e);
                            // ACK malformed messages to avoid infinite reprocessing
                            let _: Result<i64, _> = conn
                                .xack(&stream_key.key, CONSUMER_GROUP, &[&msg.id])
                                .await;
                        }
                    }
                }
            }
        }
    }

    /// Run the outbound publisher — reads from engine events channel and writes to Redis.
    pub async fn run_outbound(
        &self,
        mut evt_rx: mpsc::Receiver<EngineEvent>,
    ) -> Result<()> {
        let mut conn = self.client.get_multiplexed_async_connection().await?;

        info!("Outbound transport started");

        while let Some(event) = evt_rx.recv().await {
            if let Err(e) = self.publish_event(&mut conn, &event).await {
                error!("Failed to publish event: {}", e);
            }
        }

        info!("Engine channel disconnected, stopping outbound");
        Ok(())
    }

    async fn publish_event(
        &self,
        conn: &mut MultiplexedConnection,
        event: &EngineEvent,
    ) -> Result<()> {
        match event {
            EngineEvent::TradeExecuted(trade) => {
                let json = serde_json::to_string(trade)?;
                let _: String = redis::cmd("XADD")
                    .arg(TRADES_STREAM)
                    .arg("MAXLEN").arg("~").arg(100_000u64)
                    .arg("*")
                    .arg("data").arg(&json)
                    .query_async(conn)
                    .await?;
            }
            EngineEvent::OrderStatusChanged(status) => {
                let json = serde_json::to_string(status)?;
                let _: String = redis::cmd("XADD")
                    .arg(ORDER_STATUS_STREAM)
                    .arg("MAXLEN").arg("~").arg(100_000u64)
                    .arg("*")
                    .arg("data").arg(&json)
                    .query_async(conn)
                    .await?;
            }
            EngineEvent::OrderBookSnapshot(snapshot) => {
                let json = serde_json::to_string(snapshot)?;
                // Store latest snapshot as a simple key (overwrite)
                let key = format!("orderbook:{}", snapshot.pair);
                let _: () = conn.set(&key, &json).await?;
                // Also publish for real-time subscribers
                let channel = format!("orderbook:updates:{}", snapshot.pair);
                let _: () = conn.publish(&channel, &json).await?;
            }
        }
        Ok(())
    }
}

fn parse_order_command(msg: &StreamId) -> Result<EngineCommand> {
    let data: String = msg
        .get("data")
        .ok_or_else(|| anyhow::anyhow!("Missing 'data' field"))?;
    let cmd: PlaceOrderCommand = serde_json::from_str(&data)?;
    Ok(EngineCommand::PlaceOrder(cmd))
}

fn parse_cancel_command(msg: &StreamId) -> Result<EngineCommand> {
    let data: String = msg
        .get("data")
        .ok_or_else(|| anyhow::anyhow!("Missing 'data' field"))?;
    let cmd: CancelOrderCommand = serde_json::from_str(&data)?;
    Ok(EngineCommand::CancelOrder(cmd))
}
