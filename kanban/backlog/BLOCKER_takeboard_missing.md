---
id: BLOCKER-TAKEBOARD
epic: EPIC-6 — Connecteur Azuro Arbitrum
title: takeboard/epic missing
type: Blocker
sp: 0
owner: agent-otter-6
labels:
  - infra
  - kanban
deps: []
acceptance:
  - Créer `kanban/TAKEBOARD.yml` avec EPIC-6 listé et statut `Ready`.
  - Reporter le ticket blocant comme résolu dans la colonne `Done`.
  - Aucun autre contenu modifié.
evidence:
  - Capture `git status` sans modifications en cours.
---

## Contexte
Absence du TAKEBOARD empêchant de suivre l'avancement de EPIC-6.

## Validation
- [ ] TAKEBOARD présent et à jour.
- [ ] Blocage documenté.
