---
id: E10-S3
epic: EPIC-10 — Orchestration & opérations
title: Monitoring sequencers & alerte incident
type: Story
sp: 3
owner: lane-orchestrateur
labels:
  - monitoring
  - sre
  - incident-response
deps:
  - E7-S1
  - E10-S1
acceptance:
  - Monitors sequencer SX Rollup & Arbitrum (`crates/monitoring/src/bin/sequencer_check.rs` + `monitoring/sequencer_checks.yaml`) avec alertes < 2 min et publication statut pour orchestrateur (auto-pause immédiate).
  - Runbook incident `runbooks/sequencer_incident.md` incluant contact opérateur, plan fallback (suspension trading) et scénarios coordination watcher RPC SX Rollup.
  - Tests chaos ou simulation panne documentée (`analytics/sequencer_drill.md`) démontrant propagation auto-pause et reprise contrôlée.
evidence:
  - Capture alerte déclenchée (screenshot/alertmanager export).
  - Log simulation `evidence/sequencer_drill.log`.
  - Validation ops confirmée.
tasks:
  - Configurer probes (status API, block height) pour SX & Arbitrum via binaire Rust (`tokio`, `reqwest`, `serde_json`) exposant métriques Prometheus + feed orchestrateur.
  - Intégrer alerting (Pager/SMS) avec escalade et validation auto-pause lane E10.
  - Réaliser exercice DR et documenter, y compris tests croisés avec watcher RPC SX Rollup.
observability:
  - KPIs : temps détection incident, temps résolution, délai propagation auto-pause.
  - Logs : `sequencer_check.log`, `rpc_check.log`, alertmanager events (UTC ISO8601).
references:
  - docs/CHATGPT.txt
  - Arbitrum status API
  - SX Rollup status page
---

## Contexte
Des indisponibilités sequencer compromettent l’exécution. Ce ticket met en place un monitoring dédié et un plan de réponse, avec sondes Rust faiblement consommatrices adaptées au VPS, pour permettre aux autres lanes de réagir rapidement et protéger la marge.

## Validation
- [ ] Probes sequencer actives (`cargo run --bin sequencer_check`) et visibles dans Grafana.
- [ ] Exercice DR réalisé et loggé.
- [ ] Runbook approuvé par ops & produit.
