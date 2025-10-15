---
id: E11-S6
epic: EPIC-11 — Performance & optimisation ciblée
title: Paralléliser les traitements batch critiques avec Rayon
type: Story
sp: 5
owner: lane-performance
labels:
  - performance
  - rayon
  - architecture
deps:
  - E11-S1
  - E11-S4
acceptance:
  - Audit des boucles batch (`decimals_after_commission`, déduplication `crates/normalization`) documenté dans `docs/perf/rayon_batches.md` avec estimation du gain potentiel.
  - Prototype `rayon` activé via feature flag `perf-rayon` pour au moins deux parcours critiques, couvert par tests (`cargo test --features perf-rayon`) prouvant l'absence de régression.
  - Roadmap d'industrialisation (ou décision argumentée de non adoption) publiée et tickets dérivés créés pour les modules supplémentaires identifiés.
evidence:
  - Rapport `docs/perf/rayon_batches.md`.
  - Logs tests/bench (`evidence/perf/rayon_tests.txt`).
  - Tickets additionnels dans `kanban/backlog/` si de nouvelles opportunités apparaissent.
tasks:
  - Identifier les sections CPU-bound parallélisables et définir les seuils de granularité pour éviter la sur-saturation sur 2 vCPU.
  - Implémenter un prototype `rayon::par_iter()` ou `rayon::scope` sur les fonctions ciblées, avec instrumentation `tracing` pour mesurer le scaling.
  - Comparer le throughput avant/après et recommander un plan (adoption partielle, scheduling conditionnel, abandon) selon les résultats.
observability:
  - KPIs : temps traitement batch, utilisation CPU globale, contention locks.
  - Logs : métriques `tracing`/`metrics`, résultats bench/tests.
references:
  - docs/CHATGPT.txt
  - https://docs.rs/rayon/latest/rayon/
  - https://nnethercote.github.io/perf-book/parallelism.html
---

## Contexte
Certaines étapes (`odds_converter`, déduplication normalization) sont CPU-bound et pourraient tirer parti du parallélisme de données, même sur un VPS 2 vCPU. Ce ticket structure l'évaluation de `rayon` pour ces workloads, en garantissant la compatibilité avec l'environnement cible et en ouvrant de nouveaux tickets si d'autres opportunités parallélisables sont détectées.

## Validation
- [ ] Feature flag `perf-rayon` mergeable et couvert par tests assurant la cohérence fonctionnelle.
- [ ] Rapport `docs/perf/rayon_batches.md` partageant benchmarks, limites et recommandation.
- [ ] Backlog enrichi ou décision argumentée de ne pas industrialiser, selon les conclusions.
