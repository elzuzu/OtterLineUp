---
id: E8-S2
epic: EPIC-8 — Normalisation marchés & mapping
title: Dictionnaires ligues & équipes SX↔Azuro
type: Story
sp: 2
owner: lane-normalisation
labels:
  - data
  - mapping
  - taxonomy
deps:
  - E8-S1
acceptance:
  - Dictionnaires `data/dictionaries/leagues.csv` & `teams.csv` unifiant noms, IDs, sport, région.
  - Crate Rust `crates/normalization/src/dictionary_builder.rs` avec taux correspondance ≥ 98 % sur jeux de test (fuzzy + exact match).
  - Processus de mise à jour hebdo documenté (cron + PR automatique).
evidence:
  - Rapport matching `analytics/dictionary_quality.md`.
  - Résultats tests `crates/normalization/tests/dictionary_builder.rs` (`cargo test`).
  - Capture PR auto (screenshot ou lien).
tasks:
  - Extraire listes ligues/équipes SX & Azuro et nettoyer (outil CLI Rust `crates/normalization/src/bin/fetch_metadata.rs`).
  - Implémenter matching fuzzy + règles exactes (`strsim`, `regex`) optimisés pour faible overhead.
  - Configurer job de refresh (cron + pipeline) documenté.
observability:
  - KPIs : taux correspondance, taux anomalies manuelles.
  - Logs : `dictionary_builder.log`.
references:
  - docs/CHATGPT.txt
  - SX leagues endpoint
  - Azuro metadata docs
---

## Contexte
La cohérence des marchés dépend de dictionnaires fiables. Cette story crée les mappings ligues/équipes nécessaires à l’unification des flux et automatise leur actualisation via une toolchain Rust performante, adaptée aux ressources limitées du VPS, pour éviter la dérive.

## Validation
- [ ] Dictionnaires fusionnés et validés par lanes clients.
- [ ] Rapport qualité ≥ 98 %.
- [ ] Cron de mise à jour opérationnel et monitoré.
