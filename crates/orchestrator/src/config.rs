use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{env, fs, path::{Path, PathBuf}, str::FromStr};
use thiserror::Error;
use tracing::info;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(default)]
pub struct ExecConfig {
    pub sx_ttl_ms: u64,
    pub azuro_ttl_ms: u64,
    pub fill_ratio_min: f64,
    pub p95_accept_time_ms_max: u64,
    pub threshold_net_pct: f64,
    pub delta_odd_reject: f64,
    pub real_money: bool,
}
impl Default for ExecConfig {
    fn default() -> Self {
        Self { sx_ttl_ms: 800, azuro_ttl_ms: 2500, fill_ratio_min: 0.6, p95_accept_time_ms_max: 1000, threshold_net_pct: 0.015, delta_odd_reject: 0.02, real_money: true }
    }
}

#[derive(Debug, Default, Clone, Serialize, Deserialize, PartialEq)]
#[serde(default)]
pub struct ExecConfigOverride {
    pub sx_ttl_ms: Option<u64>,
    pub azuro_ttl_ms: Option<u64>,
    pub fill_ratio_min: Option<f64>,
    pub p95_accept_time_ms_max: Option<u64>,
    pub threshold_net_pct: Option<f64>,
    pub delta_odd_reject: Option<f64>,
    pub real_money: Option<bool>,
}
impl ExecConfigOverride { fn is_empty(&self) -> bool { self == &Self::default() } }

impl ExecConfig {
    fn apply(&mut self, layer: &ExecConfigOverride) {
        if let Some(v) = layer.sx_ttl_ms { self.sx_ttl_ms = v; }
        if let Some(v) = layer.azuro_ttl_ms { self.azuro_ttl_ms = v; }
        if let Some(v) = layer.fill_ratio_min { self.fill_ratio_min = v; }
        if let Some(v) = layer.p95_accept_time_ms_max { self.p95_accept_time_ms_max = v; }
        if let Some(v) = layer.threshold_net_pct { self.threshold_net_pct = v; }
        if let Some(v) = layer.delta_odd_reject { self.delta_odd_reject = v; }
        if let Some(v) = layer.real_money { self.real_money = v; }
    }

    fn hash(&self) -> Result<String, ConfigError> {
        let mut hasher = Sha256::new();
        hasher.update(serde_json::to_vec(self).map_err(|source| ConfigError::Serialize { source })?);
        Ok(format!("{:x}", hasher.finalize()))
    }
}

pub type ConfigLayer = &'static str;

#[derive(Debug, Clone)]
pub struct ConfigSnapshot { pub config: ExecConfig, pub layers: Vec<ConfigLayer>, pub hash: String }

#[derive(Debug)]
pub struct ConfigManager { path: PathBuf, env_prefix: String, cli_override: Option<ExecConfigOverride>, snapshot: ConfigSnapshot }

#[derive(Debug, Error)]
pub enum ConfigError {
    #[error("failed to read config file {path:?}")]
    Io { path: PathBuf, source: std::io::Error },
    #[error("failed to parse config file {path:?}")]
    ParseFile { path: PathBuf, source: serde_yaml::Error },
    #[error("environment variable {key} contains invalid unicode")]
    EnvUnicode { key: String },
    #[error("environment variable {key} with value {value:?} cannot be parsed: {reason}")]
    EnvParse { key: String, value: String, reason: String },
    #[error("REAL_MONEY flag must be true in active configuration")]
    RealMoneyDisabled,
    #[error("failed to serialize configuration: {source}")]
    Serialize { source: serde_json::Error },
}

impl ConfigManager {
    pub fn new(path: impl Into<PathBuf>, env_prefix: impl Into<String>) -> Result<Self, ConfigError> {
        Self::new_with_cli(path, env_prefix, None)
    }

    pub fn new_with_cli(path: impl Into<PathBuf>, env_prefix: impl Into<String>, cli_override: Option<ExecConfigOverride>) -> Result<Self, ConfigError> {
        let path = path.into();
        let env_prefix = env_prefix.into();
        let snapshot = Self::load_layers(&path, &env_prefix, cli_override.as_ref())?;
        info!(hash=%snapshot.hash, layers=?snapshot.layers, "exec config loaded");
        Ok(Self { path, env_prefix, cli_override, snapshot })
    }

    pub fn snapshot(&self) -> &ConfigSnapshot { &self.snapshot }

    pub fn reload(&mut self) -> Result<&ConfigSnapshot, ConfigError> {
        self.snapshot = Self::load_layers(&self.path, &self.env_prefix, self.cli_override.as_ref())?;
        info!(hash=%self.snapshot.hash, layers=?self.snapshot.layers, "exec config reloaded");
        Ok(&self.snapshot)
    }

    pub fn set_cli_override(&mut self, cli_override: Option<ExecConfigOverride>) -> Result<&ConfigSnapshot, ConfigError> {
        self.cli_override = cli_override;
        self.reload()
    }

    fn load_layers(path: &Path, env_prefix: &str, cli_override: Option<&ExecConfigOverride>) -> Result<ConfigSnapshot, ConfigError> {
        let mut config = ExecConfig::default();
        let mut layers = vec!["defaults"];
        if path.exists() {
            let content = fs::read_to_string(path).map_err(|source| ConfigError::Io { path: path.to_path_buf(), source })?;
            let file_layer: ExecConfigOverride = serde_yaml::from_str(&content).map_err(|source| ConfigError::ParseFile { path: path.to_path_buf(), source })?;
            if !file_layer.is_empty() { config.apply(&file_layer); layers.push("file"); }
        }
        let (env_layer, env_used) = env_override(env_prefix)?;
        if env_used { config.apply(&env_layer); layers.push("env"); }
        if let Some(cli_layer) = cli_override { if !cli_layer.is_empty() { config.apply(cli_layer); layers.push("cli"); } }
        if !config.real_money { return Err(ConfigError::RealMoneyDisabled); }
        let hash = config.hash()?;
        Ok(ConfigSnapshot { config, layers, hash })
    }
}

fn env_override(prefix: &str) -> Result<(ExecConfigOverride, bool), ConfigError> {
    let mut layer = ExecConfigOverride::default();
    let mut touched = false;
    touched |= read_env(prefix, "SX_TTL_MS", |v| layer.sx_ttl_ms = Some(v))?;
    touched |= read_env(prefix, "AZURO_TTL_MS", |v| layer.azuro_ttl_ms = Some(v))?;
    touched |= read_env(prefix, "FILL_RATIO_MIN", |v| layer.fill_ratio_min = Some(v))?;
    touched |= read_env(prefix, "P95_ACCEPT_TIME_MS_MAX", |v| layer.p95_accept_time_ms_max = Some(v))?;
    touched |= read_env(prefix, "THRESHOLD_NET_PCT", |v| layer.threshold_net_pct = Some(v))?;
    touched |= read_env(prefix, "DELTA_ODD_REJECT", |v| layer.delta_odd_reject = Some(v))?;
    touched |= read_env(prefix, "REAL_MONEY", |v| layer.real_money = Some(v))?;
    Ok((layer, touched))
}

fn read_env<T>(prefix: &str, key: &str, mut setter: impl FnMut(T)) -> Result<bool, ConfigError>
where
    T: FromStr,
    <T as FromStr>::Err: ToString,
{
    let var = format!("{}{}", prefix, key);
    match env::var(&var) {
        Ok(value) => {
            let parsed = value.parse::<T>().map_err(|err| ConfigError::EnvParse { key: var.clone(), value, reason: err.to_string() })?;
            setter(parsed);
            Ok(true)
        }
        Err(env::VarError::NotPresent) => Ok(false),
        Err(env::VarError::NotUnicode(_)) => Err(ConfigError::EnvUnicode { key: var }),
    }
}
