---
id: E1-S1
epic: EPIC-1 — Gouvernance & Périmètre SX↔Azuro
title: Verrouiller le périmètre opérationnel cross-chain
type: Story
sp: 3
owner: lane-gouvernance
labels:
  - cadrage
  - compliance
  - cross-chain
deps: []
acceptance:
  - Inventaire `env/prod.env.yaml` complété avec RPC/WS SX Rollup et Arbitrum One (Azuro), deux wallets séparés et latences cibles ≤ 250 ms sans bridge inter-chaîne pendant l’exécution.
  - Périmètre marchés autorisés pré-match uniquement (1X2, handicaps, totaux) listé dans `docs/perimetre_markets.md` avec ligues en liste blanche et rappel m_net ≥ 1,5 %.
  - Comptes SX & Azuro préfinancés ≥ 3 × mise max jambe, health-check Rust (`cargo run --bin healthcheck`) HTTP 200 / WS open archivé, et flag `REAL_MONEY=true` documenté.
evidence:
  - Fichier `env/prod.env.yaml` validé en MR signé par produit + tech.
  - Export du binaire Rust `crates/tools/src/bin/healthcheck.rs` (`cargo run --bin healthcheck`) montrant endpoints OK et latences.
  - Tableur ou note `docs/perimetre_markets.md` décrivant marchés/ligues et seuils.
tasks:
  - Cartographier endpoints officiels, SLA, auth dans `env/prod.env.yaml`.
  - Rédiger `docs/perimetre_markets.md` avec formules m_net et frais détaillés.
  - Écrire binaire Rust `crates/tools/src/bin/healthcheck.rs` (reqwest + tokio-tungstenite) et stocker sortie dans `evidence/`.
observability:
  - KPIs : latence RPC p95, disponibilité WS, taux de refus pré-validation.
  - Logs : horodatage health-check, réponses HTTP, durée handshake WS.
references:
  - docs/CHATGPT.txt
  - https://api.docs.sx.bet
  - https://gem.azuro.org
---

## Contexte
Le cadrage SX Rollup ↔ Azuro doit être figé avant d’engager le développement parallèle. Ce ticket fournit la vision consolidée des endpoints, des marchés autorisés et des seuils de rentabilité m_net ≥ 1,5 % pour éviter les dérives fonctionnelles et garantir que chaque lane dispose d’un environnement cohérent. Il inclut la vérification santé des deux chaînes via un binaire Rust basse latence et l’approvisionnement minimal pour couvrir les mises prévues.

## Validation
- [ ] Fichier `env/prod.env.yaml` merge avec signatures produit & tech.
- [ ] Preuve health-check (`cargo run --bin healthcheck`) déposée dans `evidence/healthcheck_*.log`.
- [ ] Documentation marchés partagée sur canal projet et liée dans README lane.
