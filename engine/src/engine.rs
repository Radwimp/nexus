use std::collections::HashMap;

use tokio::sync::mpsc;
use tracing::{error, info, warn};

use crate::matching::match_order;
use crate::orderbook::OrderBook;
use crate::types::*;

/// The engine loop — runs in a dedicated OS thread (not tokio).
/// Receives commands via channel, processes them, sends events back.
/// ZERO I/O — pure computation.
pub fn run_engine_loop(
    mut cmd_rx: mpsc::Receiver<EngineCommand>,
    evt_tx: mpsc::Sender<EngineEvent>,
) {
    let mut books: HashMap<String, OrderBook> = HashMap::new();

    for pair in &["BTC/USDT", "ETH/USDT", "ETH/BTC"] {
        books.insert(pair.to_string(), OrderBook::new(pair.to_string()));
    }

    info!("Engine loop started, {} pairs loaded", books.len());

    macro_rules! send {
        ($event:expr) => {
            if evt_tx.blocking_send($event).is_err() {
                error!("Event channel closed, stopping engine");
                return;
            }
        };
    }

    while let Some(command) = cmd_rx.blocking_recv() {
        match command {
            EngineCommand::PlaceOrder(cmd) => {
                let pair = cmd.pair.clone();

                let book = match books.get_mut(&pair) {
                    Some(b) => b,
                    None => {
                        warn!("Unknown pair: {}", pair);
                        send!(EngineEvent::OrderStatusChanged(OrderStatusEvent {
                            order_id: cmd.id,
                            status: OrderStatus::Rejected,
                            filled: rust_decimal::Decimal::ZERO,
                            remaining: cmd.quantity,
                        }));
                        continue;
                    }
                };

                let result = match_order(book, cmd);

                for trade in result.trades {
                    send!(EngineEvent::TradeExecuted(trade));
                }
                for update in result.order_updates {
                    send!(EngineEvent::OrderStatusChanged(update));
                }

                let (bids, asks) = book.snapshot(50);
                send!(EngineEvent::OrderBookSnapshot(OrderBookSnapshot {
                    pair,
                    bids,
                    asks,
                    timestamp: chrono::Utc::now(),
                }));
            }

            EngineCommand::CancelOrder(cmd) => {
                let book = match books.get_mut(&cmd.pair) {
                    Some(b) => b,
                    None => {
                        warn!("Unknown pair for cancel: {}", cmd.pair);
                        continue;
                    }
                };

                if let Some(cancelled) = book.cancel(cmd.order_id) {
                    send!(EngineEvent::OrderStatusChanged(OrderStatusEvent {
                        order_id: cancelled.id,
                        status: OrderStatus::Cancelled,
                        filled: cancelled.filled,
                        remaining: cancelled.remaining(),
                    }));

                    let (bids, asks) = book.snapshot(50);
                    send!(EngineEvent::OrderBookSnapshot(OrderBookSnapshot {
                        pair: cmd.pair,
                        bids,
                        asks,
                        timestamp: chrono::Utc::now(),
                    }));
                } else {
                    warn!("Order not found for cancel: {}", cmd.order_id);
                }
            }
        }
    }

    info!("Engine loop stopped (channel closed)");
}
