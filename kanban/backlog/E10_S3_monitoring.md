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
  - Monitors sequencer SX Rollup & Arbitrum (`crates/monitoring/src/bin/sequencer_check.rs` + `monitoring/sequencer_checks.yaml`) avec alertes < 2 min.
  - Runbook incident `runbooks/sequencer_incident.md` incluant contact opérateur, plan fallback (suspension trading).
  - Tests chaos ou simulation panne documentée (`analytics/sequencer_drill.md`).
evidence:
  - Capture alerte déclenchée (screenshot/alertmanager export).
  - Log simulation `evidence/sequencer_drill.log`.
  - Validation ops confirmée.
tasks:
  - Configurer probes (status API, block height) pour SX & Arbitrum via binaire Rust (`tokio`, `reqwest`, `serde_json`).
  - Intégrer alerting (Pager/SMS) avec escalade.
  - Réaliser exercice DR et documenter.
observability:
  - KPIs : temps détection incident, temps résolution.
  - Logs : `sequencer_check.log`, alertmanager events.
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
