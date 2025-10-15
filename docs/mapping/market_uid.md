# Market UID Schema

Ce document décrit la convention `MarketUID` utilisée pour relier les marchés SX Rollup et Azuro.

## Structure canonique

Un `MarketUID` est un identifiant déterministe et stable dérivé des métadonnées normalisées.

```
muid|v1|<operator>|<sport>|<league>|<event>|<market_type>|<variant>|<ladder>|<event_time>|<outcome>
```

* **operator** – Identifiant opérateur (`sx`, `azuro`, …) en minuscules.
* **sport** – Discipline (`soccer`, `basketball`, …) en minuscules.
* **league** – Compétition (`premier_league`, `nba`, …).
* **event** – Affiche normalisée (`arsenal_vs_chelsea`).
* **market_type** – Type marché (`moneyline`, `spread`, `total_points`, …).
* **variant** – Variante (`pre`, `live`, `alt_line`, `na` si absent).
* **ladder** – Granularité/échelle (pas de cote, handicap, etc.), `na` si non défini.
* **event_time** – Horodatage UTC tronqué à la minute `YYYYMMDDTHHMMZ`.
* **outcome** – Libellé côté (`home`, `away`, `draw`, …).

Chaque segment est passé par un pipeline de normalisation :

1. Trim + collapse espaces.
2. Conversion ASCII lower-case.
3. Remplacement des séparateurs non alphanumériques par espace.
4. Jointure via `_`.

## MarketUID haché

Le `MarketUID` publié est la projection SHA-256 tronquée sur 24 hex chars :

```
muid-v1-<sha256(fingerprint)>[0..24)
```

Ce format garantit une taille courte tout en préservant l’unicité.

## Champs obligatoires

Les champs suivants sont requis : `operator`, `sport`, `league`, `event`, `market_type`, `outcome`, `event_timestamp`.

Une tentative de génération avec un champ requis vide renvoie `MarketUidError::MissingField(<champ>)`.

## Fallbacks

* `variant` → `na` si absent.
* `ladder` → `na` si absent.
* `event_timestamp` → tronqué à la minute (secondes/nanosecondes annulées).

## Collisions & Observabilité

* Tests de collision exécutés dans `crates/normalization/tests/market_uid.rs` via `cargo test`.
* Les pipelines d’ingestion doivent journaliser l’évènement `uid_conflict` si `DedupResult::is_clean() == false`.
* Les indicateurs `duplicate_ratio` et `retained/duplicates` sont disponibles via le résultat de déduplication.

## Utilisation

```rust
use normalization::{MarketIdentifier, MarketUid};

let identifier = MarketIdentifier {
    operator: "sx".into(),
    sport: "soccer".into(),
    league: "premier league".into(),
    event: "arsenal vs chelsea".into(),
    market_type: "moneyline".into(),
    outcome: "home".into(),
    event_timestamp: chrono::Utc::now(),
    variant: Some("pre".into()),
    ladder: None,
};

let uid = MarketUid::from_identifier(&identifier)?;
println!("{}", uid);
```

## Jeu de données seed

Une extraction de 50 marchés pilotes (mix SX/Azuro, sports majeurs) est versionnée dans `data/market_uid_seed.csv`.
Chaque ligne expose les métadonnées sources et le `MarketUID` généré.
Ces données facilitent la validation de la normalisation et de la déduplication en bout en bout.
