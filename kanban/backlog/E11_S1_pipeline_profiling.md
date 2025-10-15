---
id: E11-S1
epic: EPIC-11 — Performance & optimisation ciblée
title: Industrialiser le pipeline de profiling CPU/GPU
type: Story
sp: 5
owner: lane-performance
labels:
  - performance
  - tooling
  - observability
deps: []
acceptance:
  - Script `scripts/perf/profiling.sh` capable de lancer `cargo bench` puis `perf record`/`perf report` sur les binaries critiques, avec documentation d'utilisation.
  - Rapport `docs/perf/baseline.md` listant hotspots identifiés (fonctions, crates) et métriques p95 sur VPS cible Skylake.
  - Intégration CI optionnelle (`ci/perf.yml`) exécutant un smoke profiling hebdo avec artefacts stockés dans `logs/perf/`.
evidence:
  - Sorties `perf` archivées (`evidence/perf/baseline_*.txt`).
  - Capture `cargo bench` (`evidence/perf/benchmarks.txt`).
  - Lien vers dashboard Observability (Grafana/Prometheus) si disponible.
tasks:
  - Cartographier binaries à profiler (`crates/execution`, `crates/orchestrator`) et définir scénarios bench réalistes.
  - Écrire scripts shell Rust-friendly pour `cargo bench`, `perf`, `cargo flamegraph` (si dispo) avec gestion de droits sudo.
  - Documenter interprétation des hotspots et process d'escalade vers backlog optimisation.
observability:
  - KPIs : CPU time par crate, nombre d'allocs, temps moyen/95e bench.
  - Logs : sortie `perf`, benchmark, version Git associée.
references:
  - docs/CHATGPT.txt
  - https://perf.wiki.kernel.org/index.php/Tutorial
  - https://github.com/flamegraph-rs/flamegraph
---

## Contexte
Les optimisations identifiées doivent s'appuyer sur des mesures reproductibles sur la machine cible (2 vCPU Skylake, 3,8 GiB RAM). Ce ticket installe un pipeline de profiling continue pour révéler les hotspots dans `crates/execution` et l'orchestrateur, et servir de base aux futures opportunités d'amélioration.

## Validation
- [ ] `scripts/perf/profiling.sh` exécuté avec succès sur l'environnement VPS cible et archivé.
- [ ] `docs/perf/baseline.md` merge avec synthèse hotspots et recommandations initiales.
- [ ] Job CI planifié ou documentation claire pour lancer le profiling manuellement (mode dégradé).
