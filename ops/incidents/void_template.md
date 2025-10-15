# Incident Void / Erreur palpable — Rapport Post-Mortem

- **Incident ID** :
- **Date / Heure (UTC)** :
- **Chaîne / Marché** :
- **MarketUid / Side** :
- **Détection** : (webhook SX, simulation Azuro, revue Ops)
- **Flag REAL_MONEY** : ✅ / ❌ (expliquer si ❌)

## Chronologie (< 60 min)
| Timestamp (UTC) | Responsable | Action | Notes |
| --- | --- | --- | --- |
| | | Safe-stop activé | |
| | | Analyse exposition | |
| | | Décision compliance | |
| | | Remédiation / drain | |
| | | Clôture & métriques | |

## Analyse
- **Cause racine** :
- **Exposition nette** :
- **Δcote simulée** :
- **fill_ratio** :
- **p95_accept_time** :
- **Δquote→fill** :

## Actions correctives
- [ ] Mise à jour registre conformité
- [ ] Ajustement rulepack / config (`config/risk.yml`, `exec.yml`)
- [ ] Notification SX / Azuro envoyée
- [ ] PnL réconcilié (`ops/pnl.ts`)
- [ ] Validation Legal (signature)

## Pièces jointes
- Logs orchestrateur (`exec/exec.ts`)
- Transactions on-chain (hash)
- Export `ops/incidents/void_events.csv`
- Captures Dashboard metrics
