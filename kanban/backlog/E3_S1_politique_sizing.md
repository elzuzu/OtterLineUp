---
id: E3-S1
epic: EPIC-3 — Bankroll & sizing multi-opérateurs
title: Politique de sizing & limites SX↔Azuro
type: Story
sp: 3
owner: lane-risk
labels:
  - risk
  - bankroll
  - analytics
deps:
  - E1-S1
acceptance:
  - Modèle de sizing (flat / Kelly fractionné ≤ 0,25) publié avec scénarios bankroll 200 USD.
  - Limites par ligue/marché/mise définies et automatisables via config `risk/sizing.yaml`.
  - Seuil m_net ≥ 1,5 % confirmé après coûts (frais SX, Azuro, gaz) avec table calcul.
evidence:
  - Fichier `risk/sizing.yaml` versionné.
  - Notebook ou table `analytics/sizing_scenarios.xlsx` contenant simulations.
  - CR de revue risk signé (commentaires résolus).
tasks:
  - Collecter historiques fills/limits SX & Azuro (API quotas) pour calibrage.
  - Construire `risk/sizing.yaml` (stake min/max, ligues interdites, step size).
  - Documenter méthodologie dans `docs/risk/sizing.md` avec exemples chiffrés.
observability:
  - KPIs : taux de fills complets, ratio m_net réalisé vs cible, variance P&L.
  - Logs : journal décisions sizing par arbitrage.
references:
  - docs/CHATGPT.txt
  - sx.bet limits FAQ
  - Azuro liquidity tree docs
---

## Contexte
La rentabilité dépend d’une allocation prudente de la bankroll et d’une marge nette ≥ 1,5 % sur chaque trade. Ce ticket définit les règles de sizing, les plafonds par marché et la documentation associée pour synchroniser toutes les lanes sur les mêmes paramètres de risque.

## Validation
- [ ] `risk/sizing.yaml` approuvé par risk & produit.
- [ ] Table de simulations archivée dans `analytics/`.
- [ ] Méthodo partagée et indexée dans le README de l’epic.
