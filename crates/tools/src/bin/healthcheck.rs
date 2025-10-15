use std::{env, fs, time::Instant};

use reqwest::Client;
use serde_yaml::Value;
use tokio::time::{timeout, Duration};
use tokio_tungstenite::connect_async;

#[derive(Copy, Clone)]
enum CheckKind { Rpc, Http, Ws }

fn get_string(value: &Value, path: &[&str]) -> Option<String> {
    let mut current = value;
    for key in path {
        current = current.get(*key)?;
    }
    match current {
        Value::String(s) => Some(s.clone()),
        Value::Number(n) => Some(n.to_string()),
        Value::Bool(b) => Some(b.to_string()),
        _ => None,
    }
}

fn require_real_money(value: &Value) {
    if !value.get("compliance").and_then(|v| v.get("real_money_flag")).and_then(Value::as_bool).unwrap_or(false) {
        eprintln!("[FATAL] REAL_MONEY flag must be true in config");
        std::process::exit(2);
    }
}

async fn check_rpc(client: &Client, name: &str, url: &str) -> bool {
    let payload = serde_json::json!({"jsonrpc": "2.0", "method": "eth_blockNumber", "params": [], "id": 1});
    let start = Instant::now();
    match timeout(Duration::from_millis(1500), client.post(url).json(&payload).send()).await {
        Ok(Ok(response)) => {
            let elapsed = start.elapsed().as_millis();
            if response.status().is_success() {
                println!("[OK] {:<24} {} ({} ms)", name, url, elapsed);
                true
            } else {
                eprintln!("[ERR] {:<24} {} status {} ({} ms)", name, url, response.status(), elapsed);
                false
            }
        }
        Ok(Err(error)) => {
            eprintln!("[ERR] {:<24} {} request error: {}", name, url, error);
            false
        }
        Err(_) => {
            eprintln!("[ERR] {:<24} {} timeout after 1500 ms", name, url);
            false
        }
    }
}

async fn check_http_get(client: &Client, name: &str, url: &str) -> bool {
    let start = Instant::now();
    match timeout(Duration::from_millis(1500), client.get(url).send()).await {
        Ok(Ok(response)) => {
            let elapsed = start.elapsed().as_millis();
            if response.status().is_success() {
                println!("[OK] {:<24} {} ({} ms)", name, url, elapsed);
                true
            } else {
                eprintln!("[ERR] {:<24} {} status {} ({} ms)", name, url, response.status(), elapsed);
                false
            }
        }
        Ok(Err(error)) => {
            eprintln!("[ERR] {:<24} {} request error: {}", name, url, error);
            false
        }
        Err(_) => {
            eprintln!("[ERR] {:<24} {} timeout after 1500 ms", name, url);
            false
        }
    }
}

async fn check_ws(name: &str, url: &str) -> bool {
    let start = Instant::now();
    match timeout(Duration::from_millis(2000), connect_async(url)).await {
        Ok(Ok((_stream, _resp))) => {
            println!("[OK] {:<24} {} ({} ms)", name, url, start.elapsed().as_millis());
            true
        }
        Ok(Err(error)) => {
            eprintln!("[ERR] {:<24} {} websocket error: {}", name, url, error);
            false
        }
        Err(_) => {
            eprintln!("[ERR] {:<24} {} timeout after 2000 ms", name, url);
            false
        }
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let config_path = env::args()
        .nth(1)
        .unwrap_or_else(|| "env/prod.env.yaml".to_string());
    let contents = fs::read_to_string(&config_path)?;
    let config: Value = serde_yaml::from_str(&contents)?;
    require_real_money(&config);

    const CHECKS: [(&str, CheckKind, &[&str]); 7] = [
        ("sx_rpc_http", CheckKind::Rpc, &["chains", "sx_rollup", "rpc", "http", "url"]),
        ("azu_rpc_http", CheckKind::Rpc, &["chains", "arbitrum_one", "rpc", "http", "url"]),
        ("sx_market_data", CheckKind::Http, &["chains", "sx_rollup", "rest_api", "market_data", "url"]),
        ("sx_orders", CheckKind::Http, &["chains", "sx_rollup", "rest_api", "orders", "url"]),
        ("azuro_graphql", CheckKind::Http, &["chains", "arbitrum_one", "rest_api", "azuro_graphql", "url"]),
        ("sx_ws", CheckKind::Ws, &["chains", "sx_rollup", "rpc", "websocket", "url"]),
        ("azu_ws", CheckKind::Ws, &["chains", "arbitrum_one", "rpc", "websocket", "url"]),
    ];

    let client = Client::builder().timeout(Duration::from_secs(2)).build()?;
    let mut ok = true;
    for (name, kind, path) in CHECKS {
        if let Some(url) = get_string(&config, path) {
            ok &= match kind {
                CheckKind::Rpc => check_rpc(&client, name, &url).await,
                CheckKind::Http => check_http_get(&client, name, &url).await,
                CheckKind::Ws => check_ws(name, &url).await,
            };
        }
    }

    if ok {
        println!("[OK] healthcheck complete");
        Ok(())
    } else {
        eprintln!("[ERR] healthcheck failed");
        std::process::exit(1);
    }
}
