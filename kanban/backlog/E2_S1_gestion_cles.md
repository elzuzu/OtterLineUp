---
id: E2-S1
epic: EPIC-2 — Gestion des secrets & identité opérateur
title: Coffre-fort & rotation des clés SX/Azuro
type: Story
sp: 5
owner: lane-secrets
labels:
  - security
  - devops
  - compliance
deps:
  - E1-S1
acceptance:
  - Vault HSM (ou équivalent) provisionné avec clés SX/Azuro + rôles RBAC, rotation ≤ 30 j documentée.
  - Pipelines CI/CD récupèrent les secrets via injection dynamique sans stockage clair.
  - Journalisation des accès avec alertes sur échecs répétés et double validation pour export.
evidence:
  - Capture configuration Vault (`vault read`) anonymisée.
  - Pipeline `ci/secrets_smoke.yaml` montrant extraction OK sans secrets en clair.
  - Rapport audit accès exporté (`logs/secrets_audit.json`).
tasks:
  - Définir politiques Vault (`infra/vault/policies.hcl`) et créer rôles SX/Azuro.
  - Intégrer injection secrets dans `ci/cd` via templating (e.g. GitHub Actions / GitLab).
  - Activer audit device Vault et brancher alerting (Slack/Email) via `ops/alerts/secrets.yaml`.
observability:
  - KPIs : nombre rotations/mois, tentatives accès refusées, délai récupération secrets.
  - Logs : `vault_audit.log`, événements CI `secrets_fetch`.
references:
  - docs/CHATGPT.txt
  - HashiCorp Vault docs
  - sx.bet API auth policies
---

## Contexte
L’exécution cross-chain requiert une gestion rigoureuse des clés privées et secrets API pour éviter compromission et gel des comptes. Cette story formalise l’usage d’un coffre-fort central, la rotation automatisée et la traçabilité des accès afin que les neuf autres lanes puissent consommer les secrets de manière sécurisée et conforme.

## Validation
- [ ] Politiques Vault mergées et testées via pipeline.
- [ ] Rapport d’audit joint dans `evidence/`.
- [ ] Procédure de rotation publiée dans le runbook sécurité.
