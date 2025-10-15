---
id: E11-S2
epic: EPIC-11 — Performance & optimisation ciblée
title: Optimiser la toolchain Rust pour Skylake
type: Story
sp: 3
owner: lane-performance
labels:
  - performance
  - build
  - rust
deps:
  - E11-S1
acceptance:
  - Profil release configuré avec `lto = "thin"` et `codegen-units = 1` dans le `Cargo.toml` workspace, validé par build `cargo build --release`.
  - Variable `RUSTFLAGS="-C target-cpu=skylake -C target-feature=+avx,+avx2,+fma,+f16c"` documentée et intégrée au pipeline CI/CD (`ci/build.yml`).
  - Benchmarks comparatifs avant/après (extrait `docs/perf/build_skylake.md`) montrant le gain ou absence de régression.
evidence:
  - Logs `cargo build --release` (`evidence/perf/build_release.txt`).
  - Diff `git` du `Cargo.toml` et fichiers CI.
  - Benchmark synthèse (`docs/perf/build_skylake.md`).
tasks:
  - Ajuster `Cargo.toml` et scripts `scripts/build_release.sh` pour supporter RUSTFLAGS spécifiques Skylake.
  - Mettre à jour CI pour exporter les flags et archiver artefacts `.profdata` le cas échéant.
  - Documenter rollback et impact sur compatibilité CPU non Skylake.
observability:
  - KPIs : temps build, taille binaire, temps exécution bench clé.
  - Logs : sortie CI, `cargo build` détaillée.
references:
  - docs/CHATGPT.txt
  - https://doc.rust-lang.org/rustc/codegen-options/index.html
  - https://nnethercote.github.io/perf-book/build-configuration.html
---

## Contexte
Le VPS cible repose sur un CPU Skylake avec support AVX/AVX2/FMA/F16C. En configurant le compilateur Rust et la pipeline CI pour exploiter ces instructions, on réduit le temps d'exécution des boucles numériques (`crates/execution`, `odds_converter`) tout en gardant la reproductibilité des builds.

## Validation
- [ ] Build release réussie localement et en CI avec les flags Skylake.
- [ ] Benchmarks documentés confirmant le bénéfice (ou absence de régression) en production.
- [ ] Processus de rollback défini dans `docs/perf/build_skylake.md`.
