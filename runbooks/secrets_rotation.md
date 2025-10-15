# Runbook — Rotation des clés SX/Azuro

## Objectif
Garantir la rotation sécurisée et traçable des identifiants SX Rollup et Azuro via Vault afin de respecter l’exigence ≤ 30 jours et d’assurer la continuité du trading cross-chain.

## Portée
- Clés privées wallets SX/Azuro (`secret/data/trading/{sx,azuro}/wallet`).
- Secrets API odds/providers stockés sous `secret/data/trading/*`.
- Rôles Vault `sx-trader`, `azuro-trader`, `secrets-rotation`.

## Pré-requis
- Accès `secrets-rotation` AppRole (token unique par session) avec approbation dual-control pour export.
- CLI Vault ≥ 1.14 ou via workflow GitHub `ci/secrets_smoke.yaml`.
- Accès au canal Slack `#sec-operations` pour notifications.
- Confirmer santé RuntimeRegistry (balances à jour) et absence d’exécution en cours.

## Fréquence & Calendrier
- **Rotation standard** : toutes les 28 journées (fenêtre configurée `rotation_windows`).
- **Rotation ad-hoc** : incident sécurité, suspicion de compromission, changement d’opérateur.
- Planifier créneau hors pics pari (UTC 00:00–02:00) et prévenir Ops + Risk 24 h avant.

## Procédure de rotation standard
1. **Préparation**
   - Ouvrir ticket change `SEC-ROT-<date>` et notifier `#sec-operations`.
   - Stopper orchestrateur (`exec/exec.ts`) via auto-pause et confirmer fill_ratio ≥ 60 % (sinon escalade Risk).
2. **Authentification rotation**
   - Récupérer `role_id` + `secret_id` `secrets-rotation` depuis coffre hors-ligne (YubiHSM + control-group export, approbation duale).
   - Exporter token : `vault write auth/approle/login role_id=<role> secret_id=<secret>` → stocker dans `VAULT_TOKEN` (masqué).
3. **Génération nouveaux secrets**
   - Pour chaque chaîne :
     ```bash
     vault kv get -format=json secret/trading/sx/wallet | jq '.data.data' > backup_sx_<date>.json
     scripts/generate_wallet.ts --chain sx > new_sx_wallet.json
     vault kv put secret/trading/sx/wallet @new_sx_wallet.json
     ```
   - Répéter pour Azuro (`--chain azuro`).
   - Mettre à jour tokens API (odds, websocket) si expirent < 30 j.
4. **Rotation AppRole secrets**
   - `vault write -force auth/approle/role/sx-trader/secret-id`
   - `vault write -force auth/approle/role/azuro-trader/secret-id`
   - Documenter `secret_id_accessor` pour audit.
5. **Validation automatisée**
   - Déclencher workflow `secrets-smoke` (dispatch manuel) et vérifier succès.
   - Contrôler artifact `secrets-audit` : nouvelles entrées datées, IP CI, result=success.
6. **Redéploiement**
   - Mettre à jour variables CI/CD (`SX_TRADER_SECRET_ID`, etc.) via GitHub OIDC secrets (pas de commit).
   - Relancer orchestrateur, surveiller `p95_accept_time` sur 3 ordres.
7. **Clôture**
   - Détruire fichiers temporaires (`shred backup_*.json new_*_wallet.json`).
   - Compléter ticket change avec preuves (hash commit, artifact CI, logs Vault).

## Rotation d’urgence
1. Activer pause immédiate sur orchestrateur + hedge Azuro (`exec/hedge.ts`).
2. Révoquer tokens existants :
   ```bash
   vault write auth/token/revoke-orphan accessor=<accessor>
   vault write auth/approle/role/<role>/secret-id/destroy secret_id=<compromised>
   ```
3. Suivre procédure standard à partir de l’étape 3, mais notifier instantanément Compliance & Legal.
4. Publier rapport incident dans `ops/incidents/security_<date>.md` sous 12 h.

## Vérifications post-rotation
- `scripts/vault_smoke.sh` ok (0 exit, logs archivés).
- `RuntimeRegistry.getBank()` reflète nouvelles adresses (balances non nulles).
- `ops/metrics.ts` : aucune hausse anormale `p95_accept_time`, `fill_ratio` stable.
- Tests d’exécution dry-run (`npm run exec:digest -- --dry-run`) passent avec nouveaux secrets.

## Journalisation & Audit
- Vault audit device `file-primary` capture tous accès → synchroniser vers SIEM (socket TLS).
- Conserver rapport JSON dans `logs/secrets_audit.json` (rotation append-only).
- Contrôle mensuel : vérifier alertes `failed-auth-burst`, `control-group-export` (ops/alerts).

## Rôles & Contacts
- **Owner** : lane-secrets (`secrets@otterlineup.ch`).
- **Ops support** : `ops@otterlineup.ch`, PagerDuty `secrets-oncall`.
- **Escalade** : Compliance Lead (`legal@otterlineup.ch`) si rotation d’urgence.

## Troubleshooting
- **Erreur 403 login** : vérifier `role_id`/`secret_id`, s’assurer que rotation précédente a révoqué l’ancien secret.
- **CI secrets-smoke échoue** : re-déclencher après invalidation runner, vérifier réseau vers Vault (`VAULT_ADDR`).
- **RuntimeRegistry balance vide** : rafraîchir caches, confirmer transfert fonds vers nouvelle adresse.
- **Control-group bloqué** : obtenir second approver (Compliance) et relancer `vault write sys/control-group/authorize`.

## Références
- `infra/vault/policies.hcl`
- `ci/secrets_smoke.yaml`
- `scripts/vault_smoke.sh`
- `docs/compliance/register.md`

