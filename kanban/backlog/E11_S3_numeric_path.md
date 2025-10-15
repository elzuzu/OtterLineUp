---
id: E11-S3
epic: EPIC-11 — Performance & optimisation ciblée
title: Évaluer une voie numérique hybride Decimal/f64
type: Story
sp: 8
owner: lane-performance
labels:
  - performance
  - rust
  - research
deps:
  - E11-S1
  - E11-S2
acceptance:
  - Prototype `crates/execution/src/odds_converter.rs` instrumenté permettant de basculer entre `rust_decimal::Decimal` et `f64` via feature flag `perf-f64`.
  - Analyse précision vs performance documentée dans `docs/perf/decimal_vs_f64.md` (écart max, impact sur m_net ≥ 1,5 %).
  - Décision documentée (adoption, rejet ou plan expérimental) et backlog mis à jour si opportunités additionnelles détectées.
evidence:
  - Benchmarks `cargo bench --features perf-f64` vs défaut (`evidence/perf/decimal_vs_f64.txt`).
  - Rapport précision (`evidence/perf/precision_gap.csv`).
  - Ticket(s) additionnels créés si nouvelles optimisations détectées.
tasks:
  - Cartographier les sections hot path utilisant `Decimal` (`normalized_probabilities`, `decimals_after_commission`).
  - Implémenter feature flag `perf-f64` avec conversion finale en Decimal et tests d'intégrité (`cargo test`).
  - Comparer précision (écart maximum en basis points) et performances bench puis recommander adoption.
observability:
  - KPIs : temps fonction hot path, throughput conversion, écart de précision.
  - Logs : résultats bench, stats précision.
references:
  - docs/CHATGPT.txt
  - https://docs.rs/rust_decimal
  - https://nnethercote.github.io/perf-book/precision.html
---

## Contexte
Les conversions de cotes reposent sur `rust_decimal`, garantissant la précision financière mais à un coût CPU élevé. Cette story introduit un chemin alternatif en `f64` gouverné par un feature flag pour quantifier les gains éventuels et documenter l'impact sur la précision avant toute adoption large.

## Validation
- [ ] Feature flag `perf-f64` merge avec tests automatisés couvrant les scénarios critiques.
- [ ] Rapport `docs/perf/decimal_vs_f64.md` partagé et approuvé par produit + risk.
- [ ] Tickets dérivés créés pour les opportunités supplémentaires identifiées (vectorisation, parallélisme, etc.).
