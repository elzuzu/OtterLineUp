---
id: E5-S1
epic: EPIC-5 — Connecteur SX Rollup
title: Client temps réel SX Rollup (order & fills)
type: Story
sp: 5
owner: lane-sx
labels:
  - integration
  - sx-rollup
  - realtime
deps:
  - E1-S1
  - E2-S1
acceptance:
  - API Rust (`crates/sx_client/src/lib.rs`) exposant `getBestQuote()` et `placeBet({odds, stake, oddsSlippage})` consommant `oddsLadderStep`, `bettingDelay`, `oddsSlippage` max issus de `RuntimeRegistry.getSxMetadata()` (TTL ≤ 60 s) et `config/chains.yml` (RPC, tokens, chainId), appliquant le ladder dynamique SX (rejet si hors maille).
  - Gestion des fills partiels autorisés et du betting-delay via machine d’états `accepted/partial/void`, avec auto-cancel heartbeat (< 30 s) si perte de session ou dépassement TTL interne, et adaptation auto lorsque `providers/sx.yml` ou `chains.yml` sont modifiés (hot-reload `ConfigManager`).
  - Conventions données harmonisées : payloads camelCase, usage du champ `stake` (USD) uniquement, timestamps UTC et mapping erreurs vers codes (`E-SX-PARTIAL-TIMEOUT`, `E-SX-ODDS-LADDER`, `E-SX-METADATA-STALE`, etc.) sans panics bruts, journalisant hash config utilisé.
  - Tests d’intégration async (`crates/sx_client/tests/integration.rs`) couvrant partial fills, odds ladder dynamique, heartbeat, metadata TTL et codes d’erreur, exécutés via `cargo test`.
evidence:
  - Trace `tracing` dry-run montrant lifecycle complet (pending → accepted → settled/refused) et rafraîchissement metadata live (`RuntimeRegistry` log TTL 60 s).
  - Rapport couverture `cargo tarpaulin` ≥ 80 % pour crate client, incluant tests de reload config (`providers/sx.yml`).
  - Diagramme séquence `docs/seq/sx_client.md` annoté avec sources de config (`ConfigManager`) et sondes metadata runtime.
tasks:
  - Implémenter client WS+REST asynchrone avec backoff exponentiel (`tokio`, `reqwest`, `tungstenite`) et auth signée Ed25519, intégrant `RuntimeRegistry` (cache TTL) pour metadata SX et recalcul auto `oddsSlippage` à partir de `config/risk.yml`.
  - Créer adaptateur mapping status vers modèle interne (`crates/sx_client/src/state.rs`) assurant partial fills, betting-delay, auto-cancel heartbeat (`tokio::time::timeout`), normalisation erreurs/camelCase et vérification `allowance` live avant envoi.
  - Écrire tests (mocks + sandbox) et binaire dry-run (`crates/sx_client/src/bin/dry_run.rs`) enregistrant `fill_ratio`, `Δquote→fill`, latences, codes d’erreur standards et logs de reload config/metadata.
observability:
  - KPIs : latence round-trip, taux reconnexion, ratio fills partiels.
  - Logs : `order_id`, `status`, `latency_ms`, `retry_count`.
references:
  - docs/CHATGPT.txt
  - https://api.docs.sx.bet
  - runbooks/sx_troubleshooting.md
---

## Contexte
Le connecteur SX Rollup est critique pour déclencher la première jambe de l’arbitrage. Implémenté en Rust async (Tokio) sur VPS, il doit tolérer les latences réseau, exploiter une boucle d’événements zéro allocation superflue et gérer les fills partiels sans dégrader la marge. Cette story apporte le client temps réel robuste nécessaire aux lanes exécution et arbitrage.

## Validation
- [ ] Client merge avec `cargo test` & `cargo tarpaulin` verts.
- [ ] Dry-run (`cargo run --bin dry_run`) enregistré dans `evidence/sx_client_dryrun.log`.
- [ ] Diagramme séquence revu par orchestrateur (lane E10).
