---
id: E7-S1
epic: EPIC-7 — Observabilité & QoS transverse
title: QoS mutualisée SX↔Azuro (latence & heartbeat)
type: Story
sp: 3
owner: lane-observability
labels:
  - observability
  - sre
  - metrics
deps:
  - E1-S1
  - E5-S1
  - E6-S1
acceptance:
  - Dashboard Prometheus/Grafana `dashboards/arb_qos.json` couvrant latence (dont `p95 accept-time`), fill-ratio, Δquote→fill, taux partial fills, void-rate, santé wallets et affichant les valeurs live issues de `RuntimeRegistry` (gas, sequencer, balances) + hash config courant.
  - Alerting `ops/alerts/qos.yaml` avec seuils alignés sur `config/exec.yml` (`fill_ratio_min`, `p95_accept_time_ms_max`) et `config/risk.yml` (`stake_pct_cap` alerting), déclenchant auto-pause orchestrateur via API lorsque `fill_ratio < config` ou `p95 > config`, ou détection sequencer Arbitrum / RPC SX Rollup down, et alerte solde `< 15 USD` par wallet.
  - Binaire heartbeat Rust (`crates/monitoring/src/bin/heartbeat.rs`) consignant SX & Azuro toutes les 30 s dans `monitoring/heartbeat.log`, probant RPC SX Rollup + sequencer Arbitrum, exposant statut au service orchestrateur et mettant à jour `RuntimeRegistry.sequencerHealth()`.
  - Service watcher soldes (`crates/monitoring/src/bin/balance_watcher.rs`) sondant les deux wallets via `RuntimeRegistry.getBank()`, loggant en UTC, interdisant tout bridge automatique (alerte seulement) et publiant hash config utilisé.
evidence:
  - Capture dashboard (PNG) avant/après injection charge.
  - Export alertes Prometheus (`/api/v1/rules`).
  - Log heartbeat stocké 24 h.
tasks:
  - Instrumenter clients (lanes E5/E6) avec métriques `Prometheus` via crate `metrics` + exporter HTTP (Δquote→fill, partial fills, void-rate, accept-time) et pipeline `RuntimeRegistry` (gas, sequencer, balances).
  - Construire dashboard Grafana + alertes correspondantes synchronisées avec `ConfigManager` (hash, source CLI/ENV/fichiers) et panneaux solde wallets corrélant auto-pause.
  - Mettre en place heartbeat Rust (`crates/monitoring/src/bin/heartbeat.rs`) avec `tokio` + `reqwest` et timers basse latence, publication statut vers orchestrateur + mise à jour `RuntimeRegistry`.
  - Développer watcher soldes (`crates/monitoring/src/bin/balance_watcher.rs`) avec notifications `< 15 USD`, timestamps UTC, tests de non-bridge et validation schema `risk.yml` (`bank_source`).
observability:
  - KPIs : latence p50/p95, taux erreurs, uptime heartbeat, occurrences alertes solde.
  - Logs : `heartbeat.log`, `balance_watcher.log`, événements alertmanager (UTC ISO8601).
references:
  - docs/CHATGPT.txt
  - docs/observability/envoy.md
  - Prometheus Operator docs
---

## Contexte
Pour travailler en parallèle, chaque lane a besoin de métriques partagées sur la qualité de service des connexions SX/Azuro. Les nouveaux clients Rust haute performance exposent des métriques natives ; cette story met en place dashboards et alertes pour détecter rapidement dérives de latence ou erreurs réseau sur le VPS.

## Validation
- [ ] Dashboard importé et partagé dans Grafana.
- [ ] Alertes déclenchées lors d’un test de charge contrôlé.
- [ ] Heartbeat monitoré 24 h sans trou.
