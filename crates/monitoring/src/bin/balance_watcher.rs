use std::{path::PathBuf, time::Duration};

use anyhow::{anyhow, Context, Result};
use chrono::{SecondsFormat, Utc};
use clap::Parser;
use reqwest::Client;
use serde_json::{json, Value};
use tokio::{fs, io::AsyncWriteExt, time};

#[derive(Parser, Debug)]
#[command(author, version, about = "SX ↔ Azuro balance watcher")]
struct Cli {
    #[arg(long)]
    runtime_registry_url: String,
    #[arg(long, default_value = "monitoring/balance_watcher.log")]
    log_path: PathBuf,
    #[arg(long, default_value_t = 60)]
    interval_secs: u64,
    #[arg(long, default_value_t = 15.0)]
    alert_threshold_usd: f64,
    #[arg(long)]
    config_hash: Option<String>,
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();
    let client = Client::builder()
        .use_rustls_tls()
        .timeout(Duration::from_millis(1200))
        .build()
        .context("failed to build HTTP client")?;
    let log_path = cli.log_path.clone();
    let mut ticker = time::interval(Duration::from_secs(cli.interval_secs));
    loop {
        if let Err(err) = run_cycle(&cli, &client, &log_path).await {
            eprintln!("balance_watcher_cycle_failed: {err}");
        }
        ticker.tick().await;
    }
}

async fn run_cycle(cli: &Cli, client: &Client, log_path: &PathBuf) -> Result<()> {
    let (config_hash, entries) = fetch_snapshot(client, &cli.runtime_registry_url).await?;
    let config_hash = config_hash.or_else(|| cli.config_hash.clone());
    if entries.is_empty() {
        let tag = config_hash.as_deref().unwrap_or("unknown");
        println!("balance_watcher_no_data config_hash={tag}");
        return Ok(());
    }
    for (chain, balance_usd) in entries {
        let alert = balance_usd < cli.alert_threshold_usd;
        let record = json!({
            "timestamp": Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true),
            "chain": chain,
            "balance_usd": balance_usd,
            "threshold_usd": cli.alert_threshold_usd,
            "alert": alert,
            "config_hash": config_hash.as_deref(),
        });
        append_record(log_path, &record).await?;
        if alert {
            eprintln!(
                "balance_alert chain={} balance_usd={:.2} threshold_usd={:.2}",
                chain, balance_usd, cli.alert_threshold_usd
            );
        } else {
            println!(
                "balance_ok chain={} balance_usd={:.2} threshold_usd={:.2}",
                chain, balance_usd, cli.alert_threshold_usd
            );
        }
    }
    Ok(())
}

async fn fetch_snapshot(
    client: &Client,
    url: &str,
) -> Result<(Option<String>, Vec<(String, f64)>)> {
    let payload: Value = client
        .get(url)
        .send()
        .await
        .with_context(|| format!("failed to fetch balances from {url}"))?
        .error_for_status()
        .with_context(|| format!("runtime registry returned error for {url}"))?
        .json()
        .await
        .context("failed to parse runtime registry response")?;
    let config_hash = payload
        .get("config_hash")
        .and_then(|value| value.as_str())
        .map(str::to_owned);
    let source = payload.get("banks").unwrap_or(&payload);
    let Some(map) = source.as_object() else {
        return Err(anyhow!("runtime registry payload must be an object"));
    };
    let mut entries = Vec::with_capacity(map.len());
    for (chain, value) in map {
        if let Some(amount) = extract_amount(value) {
            entries.push((chain.to_owned(), amount));
        }
    }
    Ok((config_hash, entries))
}

fn extract_amount(value: &Value) -> Option<f64> {
    match value {
        Value::Number(num) => num.as_f64(),
        Value::String(text) => text.parse().ok(),
        Value::Object(map) => {
            for key in ["balance_usd", "usd", "amount_usd", "balance", "available", "free"] {
                if let Some(next) = map.get(key) {
                    if let Some(amount) = extract_amount(next) {
                        return Some(amount);
                    }
                }
            }
            None
        }
        _ => None,
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
        .with_context(|| format!("failed to open balance watcher log at {}", path.display()))?;
    let mut line = serde_json::to_vec(record)?;
    line.push(b'\n');
    file.write_all(&line).await?;
    Ok(())
}
