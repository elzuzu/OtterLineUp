# Runbook — Escalade Void / Erreur palpable

## Objectif
Garantir une résolution en moins d'une heure des paris void ou erreurs palpables détectées sur SX Rollup ou Azuro tout en protégeant la bankroll et la conformité.

## Déclencheurs
- Notification void/erreur palpable reçue de SX Rollup (webhook ou heartbeat alert).
- Simulation Azuro indiquant divergence de règlement > 0.02.
- Signal interne Ops ou Risk lors de revue journalière.

## Processus (SLA < 60 minutes)
1. **T0 min — Détection**
   - Ops on-call enregistre l'événement dans `ops/incidents/void_events.csv` et ouvre incident PagerDuty.
   - Vérifie statut heartbeat SX et santé sequencer Arbitrum (RuntimeRegistry).
2. **T+5 min — Safe-stop**
   - Active auto-pause via orchestrateur (`exec/exec.ts`) pour marchés impactés.
   - Bloque nouvelles prises de position sur même `marketUid`.
3. **T+15 min — Analyse**
   - Compare tickets SX partiellement remplis vs. hedges Azuro.
   - Calcule exposition nette, slippage post-impact, variations de cote.
4. **T+30 min — Décision**
   - Escalade au Compliance Lead + Risk Manager (`legal@otterlineup.ch`, `risk@otterlineup.ch`).
   - Décide remboursement, ré-exécution ou maintien.
5. **T+45 min — Remédiation**
   - Si remboursement : initie drain propre (close positions) et journalise tx.
   - Si maintien : documente justification, met à jour registre.
6. **T+60 min — Clôture**
   - Ops on-call rédige post-mortem dans `ops/incidents/void_template.md` et obtient validation Legal.
   - Met à jour métriques `ops/metrics.ts` (Δquote→fill, void_rate).

## Contacts
- Compliance Lead — legal@otterlineup.ch — +41 22 000 00 01
- Risk Manager — risk@otterlineup.ch — +41 22 000 00 02
- Ops On-call — ops@otterlineup.ch — Slack `#ops-bridge`

## Check-list post-incident
- [ ] Auto-pause confirmée et levée après validation.
- [ ] Registre compliance mis à jour.
- [ ] Logs transactionnels archivés (S3 `compliance-void/`).
- [ ] PnL impact intégré dans `ops/pnl.ts`.
- [ ] Rapport envoyé à SX/Azuro si requis.
