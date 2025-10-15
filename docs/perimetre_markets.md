# Périmètre Marchés SX Rollup ↔ Azuro (Pré-match, cash-only)

## Principes Opérationnels

- **Mode d'exécution** : jambe SX Rollup en premier, hedge Azuro Arbitrum One sans bridging runtime.
- **Type de flux** : uniquement pré-match (aucune cote live / in-play).
- **Net profitability** : arbitrages exécutés si `m_net ≥ 1,5 %` après frais réseau, frais protocole et slippage post-impact.
- **Gestion des mises** : `stake = clamp(bank_live × stake_pct_cap, stake_min, stake_max)` où les paramètres proviennent de `config/risk.yml`.
- **Couverture monétaire** : Bank live on-chain par chaîne, préfinancement ≥ 3 × mise max par jambe.
- **Sécurité runtime** : `REAL_MONEY=true` requis, auto-pause si `fill_ratio < 60 %` (fenêtre 20 trades) ou `p95_accept_time > 1000 ms`.

## Marchés Autorisés

| Famille | Description | Book SX Rollup | Hedge Azuro |
| --- | --- | --- | --- |
| 1X2 | Résultat final (domicile / nul / extérieur) | Markets `category="match_winner"` | Event lines `outcome=home/draw/away` |
| Handicap (spread) | Handicap asiatique ou européen pré-match | `category="spread"`, échelles sur ladder SX | Azuro `type="handicap"`, support marge positive/négative |
| Totaux (Over/Under) | Total points/buts pré-match | `category="total"`, step aligné ladder SX | Azuro `type="total"`, simulation AMM requise |

> Aucun autre type de marché n’est autorisé tant que la validation produit n’est pas livrée.

## Ligues en Liste Blanche

| Ligue | Sport | ID SX Rollup | ID Azuro | Notes |
| --- | --- | --- | --- | --- |
| Premier League (Angleterre) | Football | `league_id=1001` | `externalId=EPL-2024` | Calendrier stable, volumes élevés |
| Ligue 1 (France) | Football | `league_id=1003` | `externalId=L1-2024` | Retirer si reports météo massifs |
| NBA Regular Season | Basketball | `league_id=2002` | `externalId=NBA-2024` | Valider back-to-back avant exécution |
| EuroLeague | Basketball | `league_id=2005` | `externalId=EL-2024` | Cotes SX ladder 0.01, Azuro step 0.005 |

Les ligues doivent être désactivées si l’accès API officiel dépasse les latences cibles (`market_data_p95_ms ≤ 250 ms`).

## Frais et Formule m_net

```
m_net = 1 - (1 / o_SX) - (1 / o_AZU) - fees_gas - fees_proto - slip_post_impact
```

- `o_SX`: cote exécutée (post-slippage) sur SX Rollup.
- `o_AZU`: cote marginale simulée via `simulateQuote(size)` sur Azuro.
- `fees_gas`: estimation frais réseau (SX + Arbitrum One) convertis en USDC.
- `fees_proto`: frais de trading et commissions protocole SX/Azuro.
- `slip_post_impact`: slippage résiduel après remplissage.
- Seuil d'acceptation : `m_net ≥ 0.015` (1,5 %).
- Rejet automatique si `Δcote AMM simulée > 0.02`.

## Latence & Heartbeat

- SX Rollup : TTL jambe ≤ 800 ms, heartbeat 5 s, betting delay 1 s.
- Azuro : TTL ≤ 2500 ms, utilisation d’un relais de transaction privée si disponible.
- Monitoring : alerte si `sequencer_health` non vert ou `websocket_heartbeat_ms > 5000`.

## Checklist Opérationnelle

1. Vérifier bank live on-chain ≥ 3 × mise max sur SX et Azuro.
2. Confirmer que les wallets `sx_rollup` et `arbitrum_one` sont alimentés.
3. S'assurer que les RPC/WS répondent < latence cible avant de lever l'auto-pause.
4. Logger chaque run `m_net`, fill ratio et Δquote→fill dans `ops/metrics`.
5. Exporter la sortie `cargo run --bin healthcheck` vers `evidence/` en définissant `HEALTHCHECK_LOG_DIR=evidence/`.

