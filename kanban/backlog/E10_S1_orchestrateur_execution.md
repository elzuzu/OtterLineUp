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
  - Service Rust `crates/orchestrator/src/execution_service.rs` ordonnançant SX → Azuro avec TTL/ordre/partial fills issus de `config/exec.yml` (hot-reload via `ConfigManager`, priorité CLI > ENV > fichiers > defaults), bouton pause/safe-stop drain propre, enforcement flag `REAL_MONEY=true` et enchaînement hedge alt-line/total si jambe B échoue.
  - Gestion transactions idempotentes (clé `(marketUid, side, tsBucket, nonce)`), reprise sur incident (checkpoint) et persistance `orchestrator/state_store` (SQLite/SeaORM) incluant auto-pause pilotée par `config/exec.yml` (`fill_ratio_min`, `p95_accept_time_ms_max`, fenêtres) et sondes runtime (`RuntimeRegistry.sequencerHealth()`, latence RPC SX) avec réaction < 5 s.
  - Gestion des retours d’erreur normalisée (`E-SX-PARTIAL-TIMEOUT`, `E-AZU-ΔODD-THRESH`, `E-RUNTIME-SEQUENCER`, etc.) sans panics muets, timestamps logs au format UTC ISO8601 et journalisation hash config actif.
  - Runbook `runbooks/orchestrator_failover.md` couvrant partial fills, timeouts, auto-cancel heartbeat, déclenchement auto-pause (fill ratio, latence, sequencer/RPC) et reprise mode dégradé, incluant procédure reload config live & dry-run interne avant bascule.
evidence:
  - Logs orchestrateur `evidence/orchestrator_run.log` (traces `tracing` JSON) pour 30 scénarios ghost montrant reload `exec.yml`, déclenchement auto-pause < 5 s et hash config.
  - Tests E2E Rust `crates/orchestrator/tests/execution_service.rs` réussis (`cargo test`) incluant scénarios de reload config + bascule TTL sans rebuild.
  - Review runbook approuvée (screenshot/commentaire) intégrant captures `ConfigManager`/`RuntimeRegistry`.
tasks:
  - Implémenter orchestrateur Rust (state machine, orchestrated steps, retries) avec `tokio`, `async-trait`, enforcement clé idempotente, horodatage UTC et souscription aux notifications `ConfigManager`/`RuntimeRegistry` (reload à chaud, TTL).
  - Intégrer clients SX/Azuro + moteur arbitrage via bus d’événements (`nats`/`redis`) avec backpressure, mapping erreurs vers codes standards et hooks auto-pause (fill ratio, latence, sequencer/RPC down) alimentés par `RuntimeRegistry`.
  - Rédiger runbook failover et exercices tabletop incluant procédure `REAL_MONEY` gate, reprise auto-pause, tests de déclenchement (< 5 s) et checklist reload config/dry-run.
observability:
  - KPIs : temps orchestration, taux rollback, incidents par type, déclenchements auto-pause par cause.
  - Logs : `execution_service.log`, événements checkpoint avec timestamps UTC et codes erreur.
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
