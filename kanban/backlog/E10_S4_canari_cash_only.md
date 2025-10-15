---
id: E10-S4
epic: EPIC-10 — Orchestration & opérations
title: Canari cash-only (20 trades REAL_MONEY)
type: Story
sp: 3
owner: lane-orchestrateur
labels:
  - canary
  - operations
  - validation
deps:
  - E10-S1
  - E10-S2
  - E7-S1
acceptance:
  - Campagne canari de 20 trades REAL_MONEY avec flag `REAL_MONEY=true`, exécutée via orchestrateur et journalisée dans ledger SQLite/CSV.
  - Succès défini par `fill_ratio ≥ 60 %`, `m_net moyen ≥ 1,5 %`, `PnL ≥ +5 USD`; rollback automatique + dump diagnostics sinon.
  - Rapport `docs/release/canari_report.md` compilant résultats, métriques (`fill_ratio`, `m_net`, `Δquote→fill`) et plan rollback.
evidence:
  - Export ledger `analytics/pnl_ledger_canary.csv`.
  - Logs orchestrateur `evidence/canari_run.log`.
  - Validation produit/risk (commentaires approuvés).
tasks:
  - Paramétrer orchestrateur en mode canari (limites sizing, auto-pause) et déclencher 20 trades séquencés.
  - Vérifier métriques post-exécution, consolider rapport et partager avec lanes risk/compliance.
  - Mettre à jour runbook `runbooks/canari.md` avec conditions succès/rollback.
observability:
  - KPIs : fill_ratio canari, m_net moyen, PnL.
  - Logs : `canari_run.log`, diagnostics rollback.
references:
  - docs/CHATGPT.txt
  - runbooks/orchestrator_failover.md
  - risk/sizing.yaml
---

## Contexte
Le déploiement sur fonds réels nécessite une campagne canari contrôlée. Cette story organise 20 trades REAL_MONEY pour valider la chaîne SX → Azuro, vérifier les garde-fous (fill ratio, marge nette) et collecter les métriques exigées avant montée en charge. Elle garantit un rollback automatique si les seuils ne sont pas atteints et documente les enseignements pour la suite.

## Validation
- [ ] Rapport canari publié dans `docs/release/` et approuvé.
- [ ] Ledger SQLite/CSV mis à jour et contrôlé par finance/risk.
- [ ] Runbook `runbooks/canari.md` aligné avec lanes risk & compliance.
