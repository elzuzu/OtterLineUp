---
id: E6-S1
epic: EPIC-6 — Connecteur Azuro Arbitrum
title: Client Azuro Liquidity Tree & hedge
type: Story
sp: 5
owner: lane-azuro
labels:
  - integration
  - azuro
  - defi
deps:
  - E1-S1
  - E2-S1
acceptance:
  - Client GraphQL/REST Rust (`crates/azuro_client/src/lib.rs`) exposant `simulateQuote(size)` (obligatoire avant `placeBet`) retournant cote post-impact + `Δcote`, alimenté par `RuntimeRegistry.getAzuroLimits()` (TTL ≤ metadata config) et rejetant si `Δcote > delta_odd_reject` provenant de `config/risk.yml`.
  - Contrôle `maxPayout()` exécuté avant tout `placeBet()` avec rejet explicite si dépassement, prise en compte allowances live (`config/chains.yml` tokens) et support hedge/residual respectant règles void/suspension Azuro, paramétrés via `providers/azuro.yml` (timeouts, features) rechargé à chaud par `ConfigManager`.
  - Conventions données harmonisées : requêtes/réponses camelCase, `stake` (USD) distinct de `amountToken`, timestamps UTC, mapping erreurs vers codes (`E-AZU-ΔODD-THRESH`, `E-AZU-MAX-PAYOUT`, `E-AZU-SIM-REQUIRED`, etc.) sans panics, journalisant hash config actif.
  - Tests d’intégration async (`crates/azuro_client/tests/integration.rs`) couvrant simulateQuote obligatoire, contrôle `maxPayout` live, hedge/residuel, Δcote configurable et codes d’erreur, journalisant `odd_sim`, `odd_fill`, `Δ`, `payout_cap`, TTL respectés.
evidence:
  - Rapport `cargo tarpaulin` ≥ 80 % sur crate Azuro incluant tests hot-reload `providers/azuro.yml` et `risk.yml`.
  - Logs `tracing` dry-run `evidence/azuro_fill.log` montrant scenario hedge/résiduel + simulation quote obligatoire, avec traces `RuntimeRegistry` (`maxPayout`, quote marginale) et hash config.
  - Diagramme séquence `docs/seq/azuro_client.md` annoté (sources config, TTL runtime, simulation obligatoire).
tasks:
  - Implémenter client GraphQL (quotes, placements, settlement) avec résilience réseau (`async-graphql-client`, `reqwest` + `tokio`), instrumentation `tracing`, calcul `simulateQuote` post-impact branché sur `RuntimeRegistry` (TTL, conversions USD) et normalisation camelCase/timestamps UTC.
  - Mapper règles void/suspension vers modèle interne (`crates/azuro_client/src/rules.rs`) avec contrôle `maxPayout` pré-envoi, rejet `Δcote > delta_odd_reject` issu de `config/risk.yml`, validations allowances live et codes erreurs standardisés.
  - Écrire tests & binaire simulation résiduelle (`crates/azuro_client/src/bin/residual_sim.rs`) produisant métriques `odd_sim`, `odd_fill`, `Δ`, `payout_cap`, vérifiant reload config (`providers/azuro.yml`, `risk.yml`) et absence de panics.
observability:
  - KPIs : latence quote, taux success hedge, ratio void.
  - Logs : `hedge_id`, `status`, `retry_count`, `reason`.
references:
  - docs/CHATGPT.txt
  - https://gem.azuro.org
  - GitHub Azuro SDK
---

## Contexte
La seconde jambe passe par Azuro et doit absorber les rejets partiels tout en respectant les règles de suspension/void. Implémenté en Rust haute performance sur VPS (Tokio + GraphQL async), ce client doit sécuriser l’arbitrage et offrir une stratégie de hedge quand la jambe SX échoue ou reste partielle, sans saturer les ressources.

## Validation
- [ ] Client Azuro merge avec `cargo test` & `cargo tarpaulin` documentés.
- [ ] Dry-run hedge publié dans `evidence/`.
- [ ] Diagramme séquence validé par lane exécution (E9) et orchestrateur (E10).
