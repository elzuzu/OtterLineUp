---
id: E10-S2
epic: EPIC-10 — Orchestration & opérations
title: Gestion résiduelle & hedge partiel
type: Story
sp: 5
owner: lane-orchestrateur
labels:
  - risk
  - hedge
  - operations
deps:
  - E10-S1
  - E6-S1
acceptance:
  - Module Rust `crates/orchestrator/src/residual_handler.rs` gérant hedges partiels, buyback ou annulation selon ruleset risk.
  - Stratégies documentées (`docs/risk/residual_playbook.md`) avec seuils (temps, taille résiduelle, coût hedge).
  - Tests E2E Rust `crates/orchestrator/tests/residual_handler.rs` couvrant 10 scénarios (partial fill, suspension, latency spike).
evidence:
  - Logs scenario `evidence/residual_cases.log` (traces `tracing`).
  - Playbook validé par lane risk & compliance.
  - Résultats `cargo test` archivés.
tasks:
  - Définir transitions résiduel → hedge/cancel selon rulepack.
  - Implémenter handler Rust + intégration orchestrateur (state store SQLite + `tokio` tasks).
  - Documenter playbook et aligner avec risk/compliance.
observability:
  - KPIs : taux résiduels couverts, coût hedge moyen, temps résolution.
  - Logs : `residual_handler.log`.
references:
  - docs/CHATGPT.txt
  - docs/rules/rulepacks.md
  - runbooks/orchestrator_failover.md
---

## Contexte
Les fills partiels sont fréquents sur SX/Azuro. Cette story apporte les mécanismes Rust haute performance pour gérer les résiduels en conformité avec la politique de risque et éviter que la marge tombe sous 1,5 %, même avec des ressources VPS limitées.

## Validation
- [ ] `cargo test -p orchestrator --test residual_handler` vert.
- [ ] Playbook partagé et signé par risk/compliance.
- [ ] Logs scenario déposés dans `evidence/`.
