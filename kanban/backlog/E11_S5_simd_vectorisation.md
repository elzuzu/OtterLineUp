---
id: E11-S5
epic: EPIC-11 — Performance & optimisation ciblée
title: Évaluer une vectorisation SIMD des conversions de cotes
type: Story
sp: 8
owner: lane-performance
labels:
  - performance
  - simd
  - rust
deps:
  - E11-S1
  - E11-S2
  - E11-S3
acceptance:
  - Prototype `crates/execution/src/odds_converter.rs` capable d'utiliser `std::simd` (nightly) ou la crate `wide` derrière un feature flag `perf-simd`, avec fallback stable documenté.
  - Benchmarks `cargo bench --features perf-simd` comparés à la référence (sans SIMD) dans `docs/perf/simd_vectorisation.md`, incluant limites (taille des lots, overhead conversions Decimal ↔ f64).
  - Décision d'industrialisation ou de parking prise et backlog enrichi si d'autres opportunités SIMD (ex: `net_margin`, `normalization`) sont identifiées.
evidence:
  - Rapport `docs/perf/simd_vectorisation.md`.
  - Dumps bench (`evidence/perf/simd_benchmarks.txt`).
  - Tickets additionnels (`kanban/backlog/*.md`) créés le cas échéant.
tasks:
  - Cartographier les fonctions hot path vectorisables (`decimals_after_commission`, `normalized_probabilities`, `decimals_without_overround`).
  - Mettre en place un prototype SIMD en Rust (portable SIMD nightly ou crate externe) avec conversion sécurisée Decimal ↔ f64.
  - Mesurer le gain vs coût (maintenance, précision) et recommander un plan (adoption, expérimentation prolongée, abandon).
observability:
  - KPIs : temps moyen/p95 des conversions de cotes, throughput conversions par seconde.
  - Logs : résultats bench, traces `tracing` ciblant les sections vectorisées.
references:
  - docs/CHATGPT.txt
  - https://doc.rust-lang.org/std/simd/index.html
  - https://github.com/rust-lang/portable-simd
  - https://github.com/odanoburu/wide
---

## Contexte
Les conversions de cotes dans `crates/execution` sont actuellement séquentielles et reposent sur `rust_decimal`. La cible Skylake supporte AVX/AVX2/FMA/F16C, ouvrant la voie à une vectorisation SIMD pour accélérer ces calculs. Ce ticket explore des prototypes SIMD sécurisés, tout en gardant une voie stable, et documente les opportunités dérivées si d'autres modules peuvent bénéficier d'une vectorisation.

## Validation
- [ ] Prototype SIMD (`perf-simd`) mergeable derrière feature flag, avec tests automatisés garantissant la précision financière.
- [ ] Rapport `docs/perf/simd_vectorisation.md` synthétisant gains, limitations et recommandations.
- [ ] Tickets complémentaires ouverts pour les autres zones identifiées (si pertinents), ou décision argumentée de ne pas poursuivre.
