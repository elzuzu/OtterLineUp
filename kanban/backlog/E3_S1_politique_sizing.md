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
  - Politique de sizing exprimée en pourcentage de bankroll live (`bank = RuntimeRegistry.getBank()`) avec clamp `stake_pct_cap`, `stake_min`, `stake_max` définis dans `config/risk.yml`, stop-day exprimé en `%` ou montant selon config et démontrant adaptation immédiate lorsque la bankroll varie (sans rebuild).
  - Limites par ligue/marché/mise paramétrables dans `config/risk.yml` (`oddsSlippage` par type, marchés exclus, hedge policy) et rechargées à chaud via `ConfigManager` (priorité CLI > ENV > fichiers > defaults) avec validation de schéma.
  - Seuil `m_net ≥ threshold_net_pct` (défini dans `config/risk.yml`) confirmé après coûts dynamiques (frais SX/Azuro live, gas runtime, slippage simulé) avec table calcul et estimateur ±5 % documenté.
  - Politique de surveillance soldes (`watchers/balance_policies.md`) rappelant alerte `< 15 USD`/wallet, interdiction bridge auto et journalisation du hash de config actif par trade.
evidence:
  - Fichier `config/risk.yml` versionné + `defaults.yml` illustrant precedence, avec hash de version référencé.
  - Notebook ou table `analytics/sizing_scenarios.xlsx` contenant simulations montrant variation auto lorsque `bank_source` change (onchain vs fixed test).
  - CR de revue risk signé (commentaires résolus) incluant capture reload à chaud (`ConfigManager` log) et tests stop-loss `%` vs absolu.
tasks:
  - Collecter historiques fills/limits SX & Azuro (API quotas) pour calibrage et intégrer conversions USD via oracles chainlink/off-chain signés.
  - Construire `config/risk.yml` (bank_source, stake min/max, ligues interdites, `oddsSlippage` bornes, hedge policy) + `defaults.yml`, brancher le watcher solde et mettre en place reload à chaud via `ConfigManager` (watcher FS, validation schema Zod/JSON-Schema).
  - Documenter méthodologie dans `docs/risk/sizing.md` avec exemples chiffrés, rappel alerte solde `< 15 USD`, description precedence CLI > ENV > fichiers > defaults et procédure de dry-run avant bascule.
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
- [ ] `config/risk.yml` + `defaults.yml` approuvés par risk & produit (hash consigné).
- [ ] Table de simulations archivée dans `analytics/` démontrant variation auto (bank 180 → 240 USD).
- [ ] Méthodo partagée et indexée dans le README de l’epic avec procédure reload `ConfigManager`.
