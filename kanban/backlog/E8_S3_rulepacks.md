---
id: E8-S3
epic: EPIC-8 — Normalisation marchés & mapping
title: Rulepacks SX↔Azuro (void, OT, handicaps)
type: Story
sp: 3
owner: lane-normalisation
labels:
  - rules
  - product
  - data
deps:
  - E8-S1
  - E8-S2
acceptance:
  - Rulepacks JSON `config/rulepacks/` couvrant 1X2, handicaps, totaux avec champs void/OT inclus/exclus.
  - Tests `crates/normalization/tests/rulepacks.rs` garantissant alignement SX/Azuro sur 20 cas réels (`cargo test`).
  - Documentation `docs/rules/rulepacks.md` avec workflow mise à jour et mapping.
evidence:
  - Rapport tests + couverture.
  - Exemple de diff rulepack revu (PR screenshot).
  - Validation produit confirmée (commentaire).
tasks:
  - Modéliser attributs règles (cashout, OT, retrait joueur) et structurer JSON.
  - Implémenter loader Rust `crates/normalization/src/rulepack_loader.rs` avec validation schéma (`schemars`).
  - Écrire tests sur cas limites (annulations, prolongations) + bench `cargo criterion`.
observability:
  - KPIs : nombre incidents rulepack, delta règles détecté.
  - Logs : `rulepack_loader.log`.
references:
  - docs/CHATGPT.txt
  - SX rules documentation
  - Azuro settlement rules
---

## Contexte
Des divergences de règles entraînent des arbitrages annulés. Cette story crée les rulepacks structurés pour harmoniser SX et Azuro et fournit une implémentation Rust optimisée (validation en streaming) afin que le moteur puisse déterminer correctement les risques sans surcoût CPU sur le VPS.

## Validation
- [ ] Rulepacks mergés après revue produit.
- [ ] `cargo test -p normalization --test rulepacks` vert et intégré CI.
- [ ] Documentation publiée et référencée.
