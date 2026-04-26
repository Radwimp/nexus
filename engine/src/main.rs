mod engine;
mod matching;
mod orderbook;
mod transport;
mod types;

use std::thread;

use anyhow::Result;
use tokio::sync::mpsc;
use tracing::{error, info};
use tracing_subscriber::EnvFilter;

use crate::engine::run_engine_loop;
use crate::transport::Transport;

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();

    let redis_url =
        std::env::var("REDIS_URL").unwrap_or_else(|_| "redis://127.0.0.1:6379".to_string());

    info!("Exchange Engine starting...");
    info!("Redis: {}", redis_url);

    // Commands: transport → engine
    let (cmd_tx, cmd_rx) = mpsc::channel::<types::EngineCommand>(1024);
    // Events: engine → transport
    let (evt_tx, evt_rx) = mpsc::channel::<types::EngineEvent>(1024);

    // Spawn the engine loop in a dedicated OS thread (no async overhead)
    let engine_handle = thread::spawn(move || {
        info!("Engine thread started");
        run_engine_loop(cmd_rx, evt_tx);
        info!("Engine thread stopped");
    });

    let transport_inbound = Transport::new(&redis_url)?;
    let transport_outbound = Transport::new(&redis_url)?;

    let inbound = tokio::spawn(async move {
        if let Err(e) = transport_inbound.run_inbound(cmd_tx).await {
            error!("Inbound transport error: {}", e);
        }
    });

    let outbound = tokio::spawn(async move {
        if let Err(e) = transport_outbound.run_outbound(evt_rx).await {
            error!("Outbound transport error: {}", e);
        }
    });

    info!("Exchange Engine running. Press Ctrl+C to stop.");

    tokio::signal::ctrl_c().await?;
    info!("Shutting down...");

    inbound.abort();
    outbound.abort();

    // Engine thread exits when cmd_rx is dropped (inbound task abort drops cmd_tx)
    if let Err(e) = engine_handle.join() {
        error!("Engine thread panicked: {:?}", e);
    }

    info!("Exchange Engine stopped.");
    Ok(())
}
