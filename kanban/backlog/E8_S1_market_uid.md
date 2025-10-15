---
id: E8-S1
epic: EPIC-8 — Normalisation marchés & mapping
title: Générateur d’UID marché SX↔Azuro
type: Story
sp: 3
owner: lane-normalisation
labels:
  - data
  - mapping
  - markets
deps:
  - E1-S1
acceptance:
  - Schéma d’UID (`docs/mapping/market_uid.md`) combinant opérateur, ligue, type marché, timestamp, outcome et définissant MarketUID canonique (hash métadonnées normalisées).
  - Crate Rust `crates/normalization/src/market_uid.rs` générant UID déterministe avec tests de collision et vérification hash canonique.
  - Base de données `data/market_uid_seed.csv` pour 50 marchés pilotes synchronisée.
evidence:
  - Tests `crates/normalization/tests/market_uid.rs` verts via `cargo test` avec rapport collisions.
  - Documentation mapping publiée et revue lanes E5/E6.
  - Export CSV versionné.
tasks:
  - Définir structure UID + règles fallback quand champ manquant.
  - Implémenter bibliothèque Rust (`serde`, `chrono`) + tests unitaires & property-based.
  - Alimenter CSV seed via extraction SX/Azuro (outil CLI Rust `crates/normalization/src/bin/export_seed.rs`).
observability:
  - KPIs : taux collisions, temps génération UID.
  - Logs : anomalies `uid_conflict`.
references:
  - docs/CHATGPT.txt
  - sx.bet API market schema
  - Azuro market schema
---

## Contexte
Les connecteurs et le moteur d’arbitrage doivent parler le même langage de marché. Cette story définit un identifiant unique commun et fournit les données seed, avec une implémentation Rust thread-safe adaptée au déploiement VPS, pour permettre aux lanes de normaliser rapidement les flux.

## Validation
- [ ] `cargo test -p normalization --test market_uid` vert en CI.
- [ ] CSV seed validé par lanes données et arbitrage.
- [ ] Documentation référencée dans README epic.
