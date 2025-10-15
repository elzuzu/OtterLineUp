---
id: E9-S1
epic: EPIC-9 — Exécution & risk engines
title: Convertisseurs de cotes & marge SX↔Azuro
type: Story
sp: 5
owner: lane-execution
labels:
  - pricing
  - maths
  - engine
deps:
  - E5-S1
  - E6-S1
  - E8-S1
acceptance:
  - Crate Rust `crates/execution/src/odds_converter.rs` supportant décimal ↔ américain ↔ probabilités, removal commission SX/Azuro.
  - Calcul du m_net intégré (`crates/execution/src/net_margin.rs`) tenant compte slippage simulé, frais, arrondis et estimateur gas/frais ±5 %.
  - Tests unitaires & property-based (`proptest`) > 90 % coverage et validation formule `m_net = 1 - 1/o_SX - 1/o_Azuro - frais - gas - slip`.
evidence:
  - Rapport `cargo test` + `cargo tarpaulin` pour crate execution.
  - Notebook validation `analytics/odds_validation.ipynb` avec cas réels.
  - Document QA confirmant alignement vs quotes historiques.
tasks:
  - Implémenter convertisseurs + normalisation overround avec calculs `decimal` haute précision (`rust_decimal`).
  - Ajouter calcul m_net + simulation slippage configurable (`crates/execution/src/slippage.rs`).
  - Construire suites de tests (property-based + fixtures réelles) et bench `cargo criterion` pour vérifier latence.
observability:
  - KPIs : erreurs conversion, delta m_net vs réel.
  - Logs : `conversion_error.log`.
references:
  - docs/CHATGPT.txt
  - Literature surebet formulas
  - SX/Azuro fee schedules
---

## Contexte
Le moteur d’exécution s’appuie sur des conversions précises et une estimation fiable de la marge nette. Cette story fournit la librairie Rust vectorisée et les calculs m_net nécessaires pour déclencher ou rejeter un arbitrage sur un VPS, tout en limitant la latence et la consommation CPU.

## Validation
- [ ] `cargo test -p execution` (unit + proptest) verts.
- [ ] Notebook validation partagé et revu.
- [ ] Calcul m_net intégré dans pipeline lane E9/E10.
