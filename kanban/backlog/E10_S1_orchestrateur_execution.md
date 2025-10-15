---
id: E10-S1
epic: EPIC-10 — Orchestration & opérations
title: Orchestrateur d’exécution cross-chain
type: Story
sp: 8
owner: lane-orchestrateur
labels:
  - orchestration
  - workflow
  - automation
deps:
  - E5-S1
  - E6-S1
  - E7-S1
  - E9-S3
acceptance:
  - Service Rust `crates/orchestrator/src/execution_service.rs` ordonnançant SX → Azuro avec TTL SX ≤ 800 ms et TTL Azuro ≤ 2,5 s, bouton pause/safe-stop drain propre et enchaînement hedge alt-line/total si jambe B échoue.
  - Gestion transactions idempotentes, reprise sur incident (checkpoint) et persistance `orchestrator/state_store` (SQLite/SeaORM) incluant auto-pause si `fill_ratio < 60 %` (fenêtre 20 trades) ou `p95 accept-time > 1 s`.
  - Runbook `runbooks/orchestrator_failover.md` couvrant partial fills, timeouts, auto-cancel heartbeat et déclenchement mode dégradé.
evidence:
  - Logs orchestrateur `evidence/orchestrator_run.log` (traces `tracing` JSON) pour 30 scénarios ghost.
  - Tests E2E Rust `crates/orchestrator/tests/execution_service.rs` réussis (`cargo test`).
  - Review runbook approuvée (screenshot/commentaire).
tasks:
  - Implémenter orchestrateur Rust (state machine, orchestrated steps, retries) avec `tokio`, `async-trait`.
  - Intégrer clients SX/Azuro + moteur arbitrage via bus d’événements (`nats`/`redis`) avec backpressure.
  - Rédiger runbook failover et exercices tabletop.
observability:
  - KPIs : temps orchestration, taux rollback, incidents par type.
  - Logs : `execution_service.log`, événements checkpoint.
references:
  - docs/CHATGPT.txt
  - runbooks/execution.md
  - Sagas pattern docs
---

## Contexte
L’orchestrateur coordonne les clients et le moteur pour exécuter ou annuler les arbitrages. Implémenté en Rust async sur VPS, il doit supporter les fills partiels, exploiter une machine d’états performante et permettre la reprise après incident pour garantir fiabilité et respect du seuil m_net.

## Validation
- [ ] `cargo test -p orchestrator --test execution_service` vert.
- [ ] Logs ghost-run archivés et analysés.
- [ ] Runbook partagé et validé par ops (lane observabilité).
