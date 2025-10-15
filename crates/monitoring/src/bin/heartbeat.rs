use std::{path::PathBuf, time::Duration};

use anyhow::{Context, Result};
use chrono::{SecondsFormat, Utc};
use clap::Parser;
use reqwest::Client;
use serde_json::{json, Value};
use tokio::{fs, io::AsyncWriteExt, time};

#[derive(Parser, Debug)]
#[command(author, version, about = "SX ↔ Azuro heartbeat monitor")]
struct Cli {
    #[arg(long)]
    sx_health_endpoint: String,
    #[arg(long)]
    azuro_health_endpoint: String,
    #[arg(long)]
    runtime_registry_url: Option<String>,
    #[arg(long)]
    orchestrator_url: Option<String>,
    #[arg(long, default_value = "monitoring/heartbeat.log")]
    log_path: PathBuf,
    #[arg(long, default_value_t = 30)]
    interval_secs: u64,
    #[arg(long, default_value_t = 1200)]
    timeout_ms: u64,
    #[arg(long)]
    config_hash: Option<String>,
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();
    let client = Client::builder()
        .use_rustls_tls()
        .timeout(Duration::from_millis(cli.timeout_ms))
        .build()
        .context("failed to build HTTP client")?;
    println!(
        "heartbeat_start interval={} timeout_ms={}",
        cli.interval_secs, cli.timeout_ms
    );
    let mut ticker = time::interval(Duration::from_secs(cli.interval_secs));
    let log_path = cli.log_path.clone();
    loop {
        ticker.tick().await;
        if let Err(err) = run_cycle(&cli, &client, &log_path).await {
            eprintln!("heartbeat_cycle_failed: {err}");
        }
    }
}

async fn run_cycle(cli: &Cli, client: &Client, log_path: &PathBuf) -> Result<()> {
    let sx_rpc = probe_endpoint(client, &cli.sx_health_endpoint).await;
    let azuro_sequencer = probe_endpoint(client, &cli.azuro_health_endpoint).await;
    let runtime_registry =
        maybe_publish(client, &cli.runtime_registry_url, &sx_rpc, &azuro_sequencer).await;
    let orchestrator =
        maybe_publish(client, &cli.orchestrator_url, &sx_rpc, &azuro_sequencer).await;
    let record = json!({
        "timestamp": Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true),
        "sx_rpc": sx_rpc,
        "azuro_sequencer": azuro_sequencer,
        "runtime_registry": runtime_registry,
        "orchestrator": orchestrator,
        "config_hash": cli.config_hash,
    });
    append_record(log_path, &record).await?;
    Ok(())
}

async fn maybe_publish(
    client: &Client,
    endpoint: &Option<String>,
    sx: &Value,
    azuro: &Value,
) -> Option<Value> {
    if let Some(url) = endpoint {
        return Some(publish_status(client, url, sx, azuro).await);
    }
    None
}

async fn probe_endpoint(client: &Client, endpoint: &str) -> Value {
    let start = time::Instant::now();
    match client.get(endpoint).send().await {
        Ok(response) => {
            let status = response.status();
            status_record(
                endpoint,
                Some(start.elapsed().as_millis()),
                Some(status.as_u16()),
                (!status.is_success()).then(|| format!("unexpected status: {}", status)),
            )
        }
        Err(err) => status_record(endpoint, None, None, Some(err.to_string())),
    }
}

fn status_record(
    endpoint: &str,
    latency_ms: Option<u128>,
    status: Option<u16>,
    error: Option<String>,
) -> Value {
    json!({
        "endpoint": endpoint,
        "latency_ms": latency_ms,
        "status": status,
        "error": error,
    })
}

async fn publish_status(client: &Client, endpoint: &str, sx: &Value, azuro: &Value) -> Value {
    let payload = json!({
        "timestamp": Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true),
        "sx_rpc": sx,
        "azuro_sequencer": azuro,
    });
    match client.post(endpoint).json(&payload).send().await {
        Ok(response) => status_record(
            endpoint,
            None,
            Some(response.status().as_u16()),
            (!response.status().is_success())
                .then(|| format!("publish failed: {}", response.status())),
        ),
        Err(err) => status_record(endpoint, None, None, Some(err.to_string())),
    }
}

async fn append_record(path: &PathBuf, record: &Value) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).await?;
    }
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .await
        .with_context(|| format!("failed to open heartbeat log at {}", path.display()))?;
    let mut line = serde_json::to_vec(record)?;
    line.push(b'\n');
    file.write_all(&line).await?;
    Ok(())
}
