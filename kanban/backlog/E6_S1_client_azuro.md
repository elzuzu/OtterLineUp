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
  - Client GraphQL/REST Rust (`crates/azuro_client/src/lib.rs`) exposant `simulateQuote(size)` retournant cote post-impact + `Δcote`, et `placeBet()` rejetant si `Δcote > 0,02` décimal.
  - Contrôle `maxPayout()` exécuté avant tout `placeBet()` avec rejet explicite si dépassement, et support hedge/residual respectant règles void/suspension Azuro.
  - Tests d’intégration async (`crates/azuro_client/tests/integration.rs`) couvrant simulateQuote, contrôle `maxPayout`, hedge/residuel et journalisant `odd_sim`, `odd_fill`, `Δ`, `payout_cap`.
evidence:
  - Rapport `cargo tarpaulin` ≥ 80 % sur crate Azuro.
  - Logs `tracing` dry-run `evidence/azuro_fill.log` montrant scenario hedge/résiduel.
  - Diagramme séquence `docs/seq/azuro_client.md`.
tasks:
  - Implémenter client GraphQL (quotes, placements, settlement) avec résilience réseau (`async-graphql-client`, `reqwest` + `tokio`), instrumentation `tracing` et calcul `simulateQuote` post-impact.
  - Mapper règles void/suspension vers modèle interne (`crates/azuro_client/src/rules.rs`) avec contrôle `maxPayout` pré-envoi et rejet `Δcote > 0,02`.
  - Écrire tests & binaire simulation résiduelle (`crates/azuro_client/src/bin/residual_sim.rs`) produisant métriques `odd_sim`, `odd_fill`, `Δ`, `payout_cap`.
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
