# Checklist Audit Compliance — SX Rollup ↔ Azuro

## Pré-trade
- [ ] `REAL_MONEY=true` appliqué sur environnement d'exécution et logué quotidiennement.
- [ ] Vérification accès unique opérateurs (pas de multi-compte) — revue des clés API / wallets.
- [ ] Bankroll live synchronisée avec RuntimeRegistry (`getBank()`), aucune valeur codée en dur.
- [ ] Config `risk.yml` et `exec.yml` validées (hash + signature Legal) < 24 h.

## Exécution SX
- [ ] Client SX (`clients/sxClient.ts`) accepte partial fills et applique `oddsSlippage` max config.
- [ ] Betting-delay respecté, heartbeat monitor actif avec auto-pause après 2 manques.
- [ ] Journalisation odds ladder et fill ratio ≥ 60 % (sinon auto-pause déclenchée).

## Hedge Azuro
- [ ] Simulation `clients/azuroClient.ts.simulateQuote` documentée, Δcote ≤ seuil `risk.yml`.
- [ ] Vérification `maxPayout()` avant ordre, rejet si dépassement.
- [ ] Transactions envoyées via relais privé si disponible (preuve screenshot / hash).

## Post-trade & Reporting
- [ ] `src/ops/metrics.ts` expose p95_accept_time, fill_ratio, Δquote→fill, void_rate, m_net_avg.
- [ ] `ops/pnl.ts` mis à jour (SQLite + export CSV) après chaque batch.
- [ ] Runbook `runbooks/void_escalation.md` suivi lors d'incident (evidence jointe).
- [ ] Registre compliance `docs/compliance/register.md` mis à jour (versionning S3).

## Contrôles périodiques
- [ ] Tabletop void trimestrielle effectuée (rapport `ops/incidents/void_template.md`).
- [ ] Revue rulepacks (`rulepacks/*.yml`) et configs hot-reload documentées.
- [ ] Logs accès & modifications conservés 12 mois, anonymisation respectée.

Validation finale :
- Compliance Lead : _____________________ (date)
- Legal Counsel : _______________________ (date)
