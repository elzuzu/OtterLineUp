# Registre conformité SX Rollup ↔ Azuro

## Synthèse obligations juridiques (Suisse)
- **LBA/AML** : conserver KYC complet des opérateurs et bénéficiaires effectifs, conservation 10 ans, screening quotidien sanctions (SECO, FINMA) via fournisseur interne RiskOps.
- **LSFin / LPCC** : absence de sollicitation publique. Limiter l'accès opérateurs internes, journaliser preuve non-diffusion au public. Documentation produits et risques conservée sur ShareVault.
- **Ordonnance sur les jeux d'argent (OJAr)** : paris sportifs autorisés uniquement pré-match; interdiction explicite du live/in-play. Doit respecter limite âge ≥ 18 ans et interdiction auto-exclu.
- **Protection des données (nLPD)** : toutes données clients chiffrées au repos, localisation serveurs UE/CH, rétention logs 12 mois maximum, anonymisation lors export.

## CGU & restrictions SX Rollup
- `REAL_MONEY=true` obligatoire sur tous environnements productifs, journalisation quotidienne contrôlée par Ops.
- **Marchés autorisés** : 1X2, handicap asiatique, totaux uniquement. Toute demande extension requiert approbation compliance.
- **Slippage / fills** : accepter partial fills via odds ladder, interdire FOK (contrat SX art. 4.2). Limite d'exposition par slip ≤ 5 % bankroll.
- **Tempo & heartbeat** : respecter betting-delay annoncé par SX; si heartbeat > 2 battements manqués → auto-pause exécution.
- **Interdictions** : bridging entre chaînes pendant exécution, multi-comptes, scripts d'exploitation latency loops.
- **Obligations reporting** : transmettre journaux trades quotidiens si demandé par SX (format JSONL). Conservation journaux 180 jours.

## CGU & restrictions Azuro (Arbitrum One)
- Respecter **maxPayout** renvoyé par LiquidityTree avant chaque bet. Rejeter si dépassement.
- **Simulation post-impact** : calculer Δcote et refuser si Δ > 0.02 (configurable `risk.yml`).
- **Private tx** : utiliser canal privé si disponible pour éviter front-running (conformité Terms 3.1).
- **Void & disputes** : notification 15 min après officialisation; escalade via processus dédié (cf. runbook). Historisation `void_events.csv`.
- **USDC only** : interdiction stablecoins alternatifs; wallet isolé.
- **Réciprocité AML** : partager logs adressage wallets avec Azuro sur demande (contrat addendum 2).

## Protocoles / ligues en liste blanche
- **Sports** : Football (UEFA, EPL, Serie A, Bundesliga, Ligue 1), Basketball (NBA, EuroLeague), Tennis (ATP/WTA), eSports (LoL LEC/LCS, CS2 Majors).
- **Exclusions** : compétitions mineures sans couverture officielle, sports régionaux non homologués, événements politiques.
- **Fournisseurs data** : StatsPerform, Sportradar. Vérifier licence active avant ingestion.

## Limites financières & marges
- Seuil m_net minimal : `≥ 1.5 %` après frais réseau/protocole/slippage.
- `stake = clamp(bank_live × stake_pct_cap, stake_min, stake_max)` selon `config/risk.yml`.
- Interdiction override manuel hors plan approuvé compliance.
- Ajuster limites si fill_ratio < 60 % sur 20 trades ou p95_accept_time > 1000 ms (auto-pause compliance + risk).


## Processus d’escalade Void / Erreur palpable
- Détection enregistrée dans `ops/incidents/void_events.csv` (Ops on-call).
- Safe-stop via orchestrateur (`exec/exec.ts`) sous 5 min, auto-pause marchés liés.
- Analyse exposition + Δcote post-impact (Risk) et décision Compliance sous 30 min.
- Remédiation (drain, remboursement, justification) complétée < 45 min avec log des transactions.
- Rapport final < 60 min via `ops/incidents/void_template.md`, validation Legal & Risk.
- Contacts escalade : legal@otterlineup.ch / risk@otterlineup.ch / ops@otterlineup.ch.

## Processus opérationnels
- **Journalisation** : tous ordres signés via HSM, audit trail stocké dans `ops/logs/` (rotation 7 jours).
- **Hot-reload configs** : config/{risk.yml, exec.yml, chains.yml, providers/*.yml, rulepacks/*.yml} surveillés; modifications logguées avec auteur, motif et validation compliance.
- **Runbooks liés** : `runbooks/void_escalation.md`, `ops/incidents/void_template.md` (SLA < 60 min, contacts consignés).
- **Contrôles périodiques** : revue mensuelle compliance avec Legal, check-lists cross-lane, rapport incidents (audit : `docs/compliance/audit_checklist.md`).

## Annexe contrôle accès
| Rôle | Responsabilités | Accès autorisés | Contact |
| --- | --- | --- | --- |
| Compliance Lead | Audit opérations, validation marchés | Git (repo privé), dashboard metrics | legal@otterlineup.ch |
| Ops On-call | Exécution quotidienne, suivi heartbeat | RuntimeRegistry (lecture), orchestrateur | ops@otterlineup.ch |
| Risk Manager | Ajustement stake_pct, suivi m_net | Config Manager (lecture/écriture sous approbation) | risk@otterlineup.ch |
| Engineering | Implémentation clients SX/Azuro | Codebase, CI/CD restreint | eng@otterlineup.ch |

## Traçabilité & validation
- Document signé électroniquement (LegalSign) par Compliance Lead & CTO.
- Stockage immutable dans coffre S3 versionné (`compliance-register/`).
- Revue trimestrielle : vérifier alignement CGU, législation CH, retours audits SX/Azuro.
