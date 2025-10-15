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
  - Moteur Rust `crates/execution/src/arb_engine.rs` détectant surebets (2-issues, 1X2) en < 200 ms (bench `cargo criterion`) avec pipeline m_net ≥ 1,5 %.
  - Gestion file d’attente, priorisation, anti-duplication, timeouts (≥ 500 ms) avec rollback jambe B si jambe A échoue.
  - Tests E2E Rust `crates/execution/tests/arb_engine_e2e.rs` (mode ghost) validant 50 scénarios, logs immuables (`tracing` JSON).
evidence:
  - Rapport E2E ghost-run `evidence/arb_engine_ghost.json`.
  - Profilage latence (`analytics/arb_latency.csv`) issu de `cargo criterion`.
  - Diagramme architecture `docs/arch/arb_engine.md`.
tasks:
  - Implémenter pipeline ingestion → normalisation → décision m_net (async, `tokio::mpsc`, `rayon` pour calculs).
  - Ajouter gestion file & transactions (idempotence, rollback) via `sled`/`sqlite` embarqué.
  - Créer tests E2E ghost + instrumentation latence (`tracing`, `metrics`).
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
