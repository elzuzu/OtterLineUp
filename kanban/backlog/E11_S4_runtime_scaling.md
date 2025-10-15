---
id: E11-S4
epic: EPIC-11 — Performance & optimisation ciblée
title: Sécuriser le parallélisme runtime et l'exploitation multi-cœurs
type: Story
sp: 5
owner: lane-performance
labels:
  - performance
  - tokio
  - architecture
deps:
  - E11-S1
acceptance:
  - Audit des runtimes (`tokio`, `rayon`) documenté dans `docs/perf/runtime_parallelisme.md`, incluant la configuration multi-thread (`#[tokio::main(flavor = "multi_thread")]`).
  - Plans de charge `tests/runtime/parallelism.rs` validant l'utilisation simultanée des 2 vCPU (≥ 150 % CPU lors des stress tests).
  - Backlog enrichi avec tickets complémentaires si besoin (ex: rayonisation `odds_converter`, sharding `HashSet`).
evidence:
  - Logs `cargo test --test parallelism -- --nocapture`.
  - Profils `htop`/`sar` capturés pendant stress test (`evidence/perf/runtime_cpu_usage.png`).
  - Documentation mise à jour (`docs/perf/runtime_parallelisme.md`).
tasks:
  - Inspecter les binaries (`src/bin/`, `crates/*`) pour confirmer la configuration runtime et ajouter tests de charge asynchrones.
  - Introduire instrumentation (tracing, metrics) pour suivre la saturation CPU.
  - Définir recommandations (ex : activer `rayon::ThreadPool` ou `tokio::task::spawn_blocking`) et ouvrir tickets dédiés.
observability:
  - KPIs : utilisation CPU moyenne/p95, nombre de tâches concurrentes, latence event loop.
  - Logs : traces `tracing` async, résultats stress tests.
references:
  - docs/CHATGPT.txt
  - https://docs.rs/tokio/latest/tokio/attr.main.html
  - https://docs.rs/rayon/latest/rayon/
---

## Contexte
Les workloads de l'orchestrateur et des engines d'exécution doivent exploiter les 2 vCPU disponibles sans saturer la boucle événementielle. Cette story vérifie et renforce la configuration des runtimes (`tokio`, `rayon`) afin d'assurer un parallélisme efficace et de détecter d'autres opportunités d'amélioration (par exemple vectorisation ou déport de calculs blocking).

## Validation
- [ ] Tests de charge validés montrant l'utilisation multi-cœur et l'absence de régressions fonctionnelles.
- [ ] Documentation `docs/perf/runtime_parallelisme.md` merge avec recommandations concrètes.
- [ ] Tickets complémentaires créés pour les optimisations découvertes.
