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
  - API Rust (`crates/sx_client/src/lib.rs`) exposant `getBestQuote()` et `placeBet({odds, stake, oddsSlippage})` avec `oddsSlippage` borné (0–2) et respect strict de l’odds-ladder SX.
  - Gestion des fills partiels autorisés et du betting-delay via machine d’états `accepted/partial/void`, avec auto-cancel heartbeat (< 30 s) si perte de session ou dépassement TTL interne.
  - Tests d’intégration async (`crates/sx_client/tests/integration.rs`) couvrant partial fills, odds ladder et heartbeat, exécutés via `cargo test`.
evidence:
  - Trace `tracing` dry-run montrant lifecycle complet (pending → accepted → settled/refused).
  - Rapport couverture `cargo tarpaulin` ≥ 80 % pour crate client.
  - Diagramme séquence `docs/seq/sx_client.md`.
tasks:
  - Implémenter client WS+REST asynchrone avec backoff exponentiel (`tokio`, `reqwest`, `tungstenite`) et auth signée Ed25519, incluant calcul `oddsSlippage` et respect de l’odds ladder SX.
  - Créer adaptateur mapping status vers modèle interne (`crates/sx_client/src/state.rs`) assurant partial fills, betting-delay et auto-cancel heartbeat (`tokio::time::timeout`).
  - Écrire tests (mocks + sandbox) et binaire dry-run (`crates/sx_client/src/bin/dry_run.rs`) enregistrant `fill_ratio`, `Δquote→fill` et latences.
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
