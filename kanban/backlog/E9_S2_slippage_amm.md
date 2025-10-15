---
id: E9-S2
epic: EPIC-9 — Exécution & risk engines
title: Modélisation slippage AMM Azuro
type: Story
sp: 3
owner: lane-execution
labels:
  - amm
  - risk
  - analytics
deps:
  - E6-S1
  - E9-S1
acceptance:
  - Modèle slippage Rust `crates/execution/src/azuro_slippage.rs` simulant impact en fonction liquidité tree (profondeur, odds) avec calculs vectorisés.
  - Table benchmarks `analytics/slippage_runs.csv` sur 100 scénarios (stake 5-50 USD) avec marge post-slippage.
  - Intégration dans calcul m_net (flag `include_slippage=true`).
evidence:
  - Rapport simulation `analytics/slippage_report.md`.
  - Tests `crates/execution/tests/azuro_slippage.rs` (`cargo test`) + bench `cargo criterion`.
  - Revue risk confirmant seuil m_net ≥ 1,5 % maintenu.
tasks:
  - Extraire paramètres liquidité Azuro (depth, fee) et modéliser fonction (chargement via `crates/azuro_client`).
  - Implémenter simulateur Rust + tests + benchs.
  - Exécuter benchmarks et consigner résultats.
observability:
  - KPIs : delta m_net pré/post slippage, erreurs modèle.
  - Logs : `slippage_simulation.log`.
references:
  - docs/CHATGPT.txt
  - Azuro liquidity docs
  - Research AMM slippage formulas
---

## Contexte
Azuro fonctionne comme un AMM ; le slippage peut réduire la marge nette en dessous du seuil requis. Cette story développe un modèle Rust optimisé (calcul vectoriel, rayon minimal d’al allocation) et l’intègre au calcul du moteur afin de sécuriser les décisions d’exécution sans grever les ressources VPS.

## Validation
- [ ] Simulateur merge avec `cargo test -p execution --test azuro_slippage` et bench `cargo criterion` archivés.
- [ ] Benchmarks archivés et partagés avec lane risk.
- [ ] Flag `include_slippage` activé par défaut dans pipeline.
