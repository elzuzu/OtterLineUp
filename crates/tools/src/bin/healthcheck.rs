use std::{
    env, fs,
    sync::Arc,
    time::{Instant, SystemTime, UNIX_EPOCH},
};

use reqwest::Client;
use serde_yaml::Value;
use time::{format_description::well_known::Rfc3339, OffsetDateTime};
use tokio::fs::{self as tokio_fs, OpenOptions};
use tokio::io::AsyncWriteExt;
use tokio::sync::Mutex;
use tokio::time::{timeout, Duration};
use tokio_tungstenite::connect_async;

#[derive(Copy, Clone)]
enum CheckKind {
    Rpc,
    Http,
    Ws,
}

struct Reporter {
    file: Option<Arc<Mutex<tokio_fs::File>>>,
}

impl Reporter {
    async fn from_env() -> Result<Self, std::io::Error> {
        let dir = env::var("HEALTHCHECK_LOG_DIR").ok().filter(|v| !v.trim().is_empty());
        if let Some(dir) = dir {
            tokio_fs::create_dir_all(&dir).await?;
            let timestamp = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map_err(|_| std::io::Error::new(std::io::ErrorKind::Other, "system time before epoch"))?;
            let path = format!(
                "{}/healthcheck_{}.log",
                dir.trim_end_matches('/'),
                timestamp.as_secs()
            );
            println!(
                "[{}] [INFO] writing healthcheck log to {}",
                now_timestamp(),
                path
            );
            let file = OpenOptions::new()
                .create(true)
                .append(true)
                .open(&path)
                .await?;
            return Ok(Self {
                file: Some(Arc::new(Mutex::new(file))),
            });
        }

        Ok(Self { file: None })
    }

    async fn log_stdout(&self, message: &str) {
        let line = format!("[{}] {}", now_timestamp(), message);
        println!("{}", line);
        self.append(&line).await;
    }

    async fn log_stderr(&self, message: &str) {
        let line = format!("[{}] {}", now_timestamp(), message);
        eprintln!("{}", line);
        self.append(&line).await;
    }

    async fn append(&self, message: &str) {
        if let Some(file) = &self.file {
            let mut guard = file.lock().await;
            if let Err(error) = guard.write_all(message.as_bytes()).await {
                eprintln!("[ERR] failed to append healthcheck log: {}", error);
            } else if let Err(error) = guard.write_all(b"\n").await {
                eprintln!("[ERR] failed to append newline to healthcheck log: {}", error);
            }
        }
    }
}

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
    if !value
        .get("compliance")
        .and_then(|v| v.get("real_money_flag"))
        .and_then(Value::as_bool)
        .unwrap_or(false)
    {
        eprintln!("[FATAL] REAL_MONEY flag must be true in config");
        std::process::exit(2);
    }
}

fn ensure_real_money_env() {
    match env::var("REAL_MONEY") {
        Ok(value) if value.eq_ignore_ascii_case("true") => {}
        _ => {
            eprintln!("[FATAL] REAL_MONEY env var must be set to 'true'");
            std::process::exit(2);
        }
    }
}

fn now_timestamp() -> String {
    OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_string())
}

async fn check_rpc(client: &Client, reporter: &Reporter, name: &str, url: &str) -> bool {
    let payload = serde_json::json!({"jsonrpc": "2.0", "method": "eth_blockNumber", "params": [], "id": 1});
    let start = Instant::now();
    match timeout(Duration::from_millis(1500), client.post(url).json(&payload).send()).await {
        Ok(Ok(response)) => {
            let elapsed = start.elapsed().as_millis();
            if response.status().is_success() {
                reporter
                    .log_stdout(&format!("[OK] {:<24} {} ({} ms)", name, url, elapsed))
                    .await;
                true
            } else {
                reporter
                    .log_stderr(&format!(
                        "[ERR] {:<24} {} status {} ({} ms)",
                        name,
                        url,
                        response.status(),
                        elapsed
                    ))
                    .await;
                false
            }
        }
        Ok(Err(error)) => {
            reporter
                .log_stderr(&format!("[ERR] {:<24} {} request error: {}", name, url, error))
                .await;
            false
        }
        Err(_) => {
            reporter
                .log_stderr(&format!("[ERR] {:<24} {} timeout after 1500 ms", name, url))
                .await;
            false
        }
    }
}

async fn check_http_get(client: &Client, reporter: &Reporter, name: &str, url: &str) -> bool {
    let start = Instant::now();
    match timeout(Duration::from_millis(1500), client.get(url).send()).await {
        Ok(Ok(response)) => {
            let elapsed = start.elapsed().as_millis();
            if response.status().is_success() {
                reporter
                    .log_stdout(&format!("[OK] {:<24} {} ({} ms)", name, url, elapsed))
                    .await;
                true
            } else {
                reporter
                    .log_stderr(&format!(
                        "[ERR] {:<24} {} status {} ({} ms)",
                        name,
                        url,
                        response.status(),
                        elapsed
                    ))
                    .await;
                false
            }
        }
        Ok(Err(error)) => {
            reporter
                .log_stderr(&format!("[ERR] {:<24} {} request error: {}", name, url, error))
                .await;
            false
        }
        Err(_) => {
            reporter
                .log_stderr(&format!("[ERR] {:<24} {} timeout after 1500 ms", name, url))
                .await;
            false
        }
    }
}

async fn check_ws(reporter: &Reporter, name: &str, url: &str) -> bool {
    let start = Instant::now();
    match timeout(Duration::from_millis(2000), connect_async(url)).await {
        Ok(Ok((_stream, _resp))) => {
            reporter
                .log_stdout(&format!(
                    "[OK] {:<24} {} ({} ms)",
                    name,
                    url,
                    start.elapsed().as_millis()
                ))
                .await;
            true
        }
        Ok(Err(error)) => {
            reporter
                .log_stderr(&format!("[ERR] {:<24} {} websocket error: {}", name, url, error))
                .await;
            false
        }
        Err(_) => {
            reporter
                .log_stderr(&format!("[ERR] {:<24} {} timeout after 2000 ms", name, url))
                .await;
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
    ensure_real_money_env();

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
    let reporter = Reporter::from_env().await?;
    let mut ok = true;
    for (name, kind, path) in CHECKS {
        if let Some(url) = get_string(&config, path) {
            ok &= match kind {
                CheckKind::Rpc => check_rpc(&client, &reporter, name, &url).await,
                CheckKind::Http => check_http_get(&client, &reporter, name, &url).await,
                CheckKind::Ws => check_ws(&reporter, name, &url).await,
            };
        }
    }

    if ok {
        reporter.log_stdout("[OK] healthcheck complete").await;
        Ok(())
    } else {
        reporter.log_stderr("[ERR] healthcheck failed").await;
        std::process::exit(1);
    }
}
