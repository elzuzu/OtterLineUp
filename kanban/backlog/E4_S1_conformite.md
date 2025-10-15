---
id: E4-S1
epic: EPIC-4 — Compliance & garde-fous réglementaires
title: Cadre conformité CH & SX/Azuro
type: Story
sp: 3
owner: lane-compliance
labels:
  - legal
  - compliance
  - risk
deps:
  - E1-S1
acceptance:
  - Registre des exigences CH (CGU SX, Azuro, KYC, anti-gubbing) consigné dans `docs/compliance/register.md`.
  - Processus d’escalade void/palpable error défini avec SLA < 1 h et contacts listés.
  - Checklist d’audit (automation, multi-compte) validée par Legal.
evidence:
  - Document `docs/compliance/register.md` signé Legal.
  - Procédure `runbooks/void_escalation.md` avec workflow.
  - CR réunion Legal × Produit.
tasks:
  - Rassembler CGU, obligations CH, contraintes API et compiler le registre.
  - Définir template d’incident void et intégrer dans `ops/incidents/void_template.md`.
  - Obtenir validation Legal + compliance via revue.
observability:
  - KPIs : nombre void/mois, temps résolution, incidents compliance.
  - Logs : registre escalade, horodatage décisions.
references:
  - docs/CHATGPT.txt
  - CGU SX Rollup
  - Azuro terms & conditions
---

## Contexte
Avant d’automatiser les exécutions, il faut un cadre conformité clair pour éviter suspension de comptes ou sanctions. Cette story consolide les obligations juridiques suisses, les CGU SX/Azuro et le processus d’escalade lors d’anomalies (void, erreurs palpables) afin que toutes les lanes développent dans un périmètre autorisé.

## Validation
- [ ] Registre compliance merge et partagé.
- [ ] Procédure void testée via tabletop et approuvée.
- [ ] Checklist audit incorporée dans pipeline de revue.
