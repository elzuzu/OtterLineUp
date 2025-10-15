use orchestrator::config::{ConfigError, ConfigManager, ExecConfigOverride};
use std::fs::File;
use std::io::Write;

fn unique_prefix() -> String {
    format!("OTTER_TEST_{}__", std::process::id())
}

#[test]
fn loads_defaults_when_file_missing() {
    let dir = tempfile::tempdir().expect("tempdir");
    let path = dir.path().join("exec.yml");
    let manager = ConfigManager::new(path, unique_prefix()).expect("default config");
    let snapshot = manager.snapshot();
    assert_eq!(snapshot.layers[0], "defaults");
    assert_eq!(snapshot.config.sx_ttl_ms, 800);
    assert!(snapshot.config.real_money);
}

#[test]
fn file_override_applies() {
    let dir = tempfile::tempdir().expect("tempdir");
    let path = dir.path().join("exec.yml");
    let mut file = File::create(&path).expect("create file");
    writeln!(
        file,
        "sx_ttl_ms: 650\nfill_ratio_min: 0.7\nreal_money: true"
    )
    .expect("write yaml");

    let manager = ConfigManager::new(&path, unique_prefix()).expect("load file");
    let snapshot = manager.snapshot();
    assert!(snapshot.layers.contains(&"file"));
    assert_eq!(snapshot.config.sx_ttl_ms, 650);
    assert!((snapshot.config.fill_ratio_min - 0.7).abs() < f64::EPSILON);
}

#[test]
fn env_override_has_priority_over_file() {
    let dir = tempfile::tempdir().expect("tempdir");
    let path = dir.path().join("exec.yml");
    let mut file = File::create(&path).expect("create file");
    writeln!(file, "threshold_net_pct: 0.02\nreal_money: true").expect("write");

    let prefix = unique_prefix();
    let var_name = format!("{}THRESHOLD_NET_PCT", prefix);
    std::env::set_var(&var_name, "0.031");

    let manager = ConfigManager::new(&path, &prefix).expect("load env override");
    let snapshot = manager.snapshot();
    assert!(snapshot.layers.contains(&"env"));
    assert!((snapshot.config.threshold_net_pct - 0.031).abs() < f64::EPSILON);

    std::env::remove_var(var_name);
}

#[test]
fn cli_override_has_highest_priority() {
    let dir = tempfile::tempdir().expect("tempdir");
    let path = dir.path().join("exec.yml");
    let mut file = File::create(&path).expect("create file");
    writeln!(file, "azuro_ttl_ms: 2400\nreal_money: true").expect("write");

    let prefix = unique_prefix();
    let env_key = format!("{}AZURO_TTL_MS", prefix);
    std::env::set_var(&env_key, "2450");

    let cli_override = ExecConfigOverride {
        azuro_ttl_ms: Some(2300),
        ..ExecConfigOverride::default()
    };
    let mut manager = ConfigManager::new_with_cli(&path, &prefix, Some(cli_override)).expect("load cli");
    let snapshot = manager.snapshot();
    assert_eq!(snapshot.config.azuro_ttl_ms, 2300);
    assert!(snapshot.layers.contains(&"cli"));

    manager
        .set_cli_override(None)
        .expect("reload without cli override");
    assert_eq!(manager.snapshot().config.azuro_ttl_ms, 2450);
    std::env::remove_var(env_key);
}

#[test]
fn rejects_when_real_money_disabled() {
    let dir = tempfile::tempdir().expect("tempdir");
    let path = dir.path().join("exec.yml");
    let mut file = File::create(&path).expect("create file");
    writeln!(file, "real_money: false").expect("write");

    let error = ConfigManager::new(&path, unique_prefix()).expect_err("real money enforcement");
    assert!(matches!(error, ConfigError::RealMoneyDisabled));
}
