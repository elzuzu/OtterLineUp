# Backlog OtterLineUp — SX Rollup ↔ Azuro

Ce backlog est structuré pour un travail parallèle de **10 lanes** (un agent par lane) couvrant l’intégralité de l’initiative cross-chain SX Rollup ↔ Azuro. Chaque ticket suit le gabarit YAML + sections Contexte/Validation décrit dans le modèle fourni, avec une orientation explicite vers une toolchain **Rust** ultra-performante adaptée aux déploiements sur VPS.

## Lanes & épics
| Lane | Epic | Focus | Owner |
| --- | --- | --- | --- |
| E1 | EPIC-1 — Gouvernance & Périmètre SX↔Azuro | Cadrage périmètre, marchés, seuil m_net ≥ 1,5 % | lane-gouvernance |
| E2 | EPIC-2 — Gestion des secrets & identité opérateur | Coffre-fort, rotation des clés, conformité secrets | lane-secrets |
| E3 | EPIC-3 — Bankroll & sizing multi-opérateurs | Modèles de mise, limites ligues/marchés | lane-risk |
| E4 | EPIC-4 — Compliance & garde-fous réglementaires | Cadre légal CH, CGU SX/Azuro, escalade void | lane-compliance |
| E5 | EPIC-5 — Connecteur SX Rollup | Client WS/REST, fills partiels, résilience | lane-sx |
| E6 | EPIC-6 — Connecteur Azuro Arbitrum | Client Liquidity Tree, hedge, règles void | lane-azuro |
| E7 | EPIC-7 — Observabilité & QoS transverse | Metrics partagées, heartbeat, alerting | lane-observability |
| E8 | EPIC-8 — Normalisation marchés & mapping | UID commun, dictionnaires, rulepacks | lane-normalisation |
| E9 | EPIC-9 — Exécution & risk engines | Conversion cotes, slippage, moteur arbitrage | lane-execution |
| E10 | EPIC-10 — Orchestration & opérations | Orchestrateur, résiduel, monitoring sequencer | lane-orchestrateur |

## Structure des tickets
Chaque fichier `.md` comprend :

1. **Front-matter YAML** avec `id`, `epic`, `title`, `type`, `sp`, `owner`, `labels`, `deps`, `acceptance`, `evidence`, `tasks`, `observability`, `references`.
2. **Section `## Contexte`** expliquant le pourquoi et les interactions.
3. **Section `## Validation`** listant la check-list finale.

Les dépendances (`deps`) matérialisent l’ordre recommandé sans empêcher l’exécution parallèle. Les lanes partagent les mêmes garde-fous : marge nette ≥ 1,5 %, gestion des fills partiels SX, respect des rulesets Azuro et monitoring des sequencers.

## Références générales
- `docs/CHATGPT.txt` : historique de cadrage & contraintes produit.
- Documentation officielle SX Rollup & Azuro.
- Runbooks à créer dans `docs/` et `runbooks/` selon les tickets.
