---
id: E9-S3
epic: EPIC-9 — Exécution & risk engines
title: Moteur d’arbitrage SX↔Azuro
type: Story
sp: 8
owner: lane-execution
labels:
  - engine
  - arbitrage
  - realtime
deps:
  - E5-S1
  - E6-S1
  - E8-S1
  - E9-S1
  - E9-S2
acceptance:
  - Moteur Rust `crates/execution/src/arb_engine.rs` calculant `m_net = 1 - 1/o_SX - 1/o_Azuro - frais - gas - slip` en utilisant frais réseau & protocole live (`RuntimeRegistry.getGas()`, `getSxMetadata()`, `getAzuroLimits()`), allowances et conversions USD runtime, et déclenchant uniquement si `m_net ≥ threshold_net_pct` (depuis `config/risk.yml`) et sizing conforme (`RiskEngine` basé sur bankroll live).
  - Gestion file d’attente priorisant `m_net/latence`, anti-duplication, timeouts parametrés via `config/exec.yml`, rollback jambe B si jambe A échoue, hedge alt-line/total configurable (policy `risk.yml`) et journalisation hash config + version runtime utilisée.
  - Logique de décision testant explicitement les cas limites `m_net = threshold_net_pct - 0,01 %` (rejet), `m_net = threshold_net_pct` (acceptation) et `Δcote = delta_odd_reject` (rejet) avec assertions dans `crates/execution/tests/arb_engine_thresholds.rs` alimentées par configs injectées.
  - Tests E2E Rust (`crates/execution/tests/arb_engine_e2e.rs`) couvrant 50 scénarios (partial fills, hedge, rollback) et journalisant `Δquote→fill`, `fill_ratio`, `m_net`, `gas_live`, `fees_protocol`, montrant adaptation immédiate à modification `risk.yml`/`exec.yml` sans rebuild.
evidence:
  - Rapport E2E ghost-run `evidence/arb_engine_ghost.json` avec métriques `gas_live`, `bank_live`, `config_hash`.
  - Profilage latence (`analytics/arb_latency.csv`) issu de `cargo criterion` incluant scénarios avant/après reload config.
  - Diagramme architecture `docs/arch/arb_engine.md` détaillant `ConfigManager`, `RuntimeRegistry`, caches TTL et precedence CLI > ENV > fichiers > defaults.
tasks:
  - Implémenter pipeline ingestion → normalisation → décision m_net (async, `tokio::mpsc`, `rayon` pour calculs) branché sur `RuntimeRegistry` (bank, gas, metadata) et `ConfigManager` (risk/exec) avec validations seuils paramétriques.
  - Ajouter gestion file & transactions (idempotence, rollback) via `sled`/`sqlite` embarqué, intégrant policy `exec.yml` (partial fills, ordonnancement) et auto-pause orchestrateur.
  - Créer tests E2E ghost + instrumentation latence (`tracing`, `metrics`) et suite `arb_engine_thresholds.rs` injectant modifications `risk.yml`/`exec.yml` à chaud et documentant décisions.
observability:
  - KPIs : latence détection, taux réussite arbitrage, ratio rollback.
  - Logs : journal immuable (ordre, timestamp, décision, raisons rejet).
references:
  - docs/CHATGPT.txt
  - littérature arbitrage surebet
  - runbooks/execution.md
---

## Contexte
Le moteur d’arbitrage orchestre la détection et la décision d’exécution. Implémenté en Rust async, il doit travailler avec les clients SX/Azuro et garantir une marge nette suffisante, même avec fills partiels ou rollback, tout en respectant la contrainte de latence sur VPS.

## Validation
- [ ] Ghost-run 50 scénarios (`cargo test -p execution --test arb_engine_e2e`) stocké et partagé.
- [ ] Profil latence `cargo criterion` analysé et actions identifiées.
- [ ] Architecture documentée et validée par lanes orchestrateur (E10) & risk (E3).
