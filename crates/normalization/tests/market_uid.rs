use chrono::TimeZone;
use normalization::{
    dedup::{deduplicate, MarketRecord},
    MarketIdentifier, MarketUid,
};
use proptest::prelude::*;
use proptest::string::string_regex;

fn required_field() -> impl Strategy<Value = String> {
    string_regex("[A-Za-z0-9][A-Za-z0-9 '\\-/]{0,31}").unwrap()
}

fn optional_field() -> impl Strategy<Value = Option<String>> {
    prop_oneof![Just(None), required_field().prop_map(Some)]
}

fn identifier_strategy() -> impl Strategy<Value = MarketIdentifier> {
    (
        required_field(),
        required_field(),
        required_field(),
        required_field(),
        required_field(),
        required_field(),
        optional_field(),
        optional_field(),
        0u32..=10_000,
    )
        .prop_map(
            |
                (
                    operator,
                    sport,
                    league,
                    event,
                    market_type,
                    outcome,
                    variant,
                    ladder,
                    minute_offset,
                ),
             | {
                let base_epoch = 1_700_000_000i64;
                let timestamp = chrono::Utc
                    .timestamp_opt(base_epoch + minute_offset as i64 * 60, 0)
                    .unwrap();

                MarketIdentifier {
                    operator,
                    sport,
                    league,
                    event,
                    market_type,
                    outcome,
                    event_timestamp: timestamp,
                    variant,
                    ladder,
                }
            },
        )
}

fn side_strategy() -> impl Strategy<Value = String> {
    string_regex("[A-Za-z0-9][A-Za-z0-9 _\\-/]{0,15}").unwrap()
}

fn source_strategy() -> impl Strategy<Value = String> {
    string_regex("[a-z]{2,8}").unwrap()
}

fn record_strategy() -> impl Strategy<Value = MarketRecord<String>> {
    (
        identifier_strategy(),
        side_strategy(),
        source_strategy(),
        required_field(),
    )
        .prop_map(|(identifier, side, source, payload)| {
            let uid = MarketUid::from_identifier(&identifier).expect("uid generation");
            MarketRecord::new(uid, side, source, payload)
        })
}

fn build_uid(event: &str, outcome: &str) -> MarketUid {
    let identifier = MarketIdentifier {
        operator: "sx".into(),
        sport: "soccer".into(),
        league: "premier league".into(),
        event: event.into(),
        market_type: "match_winner".into(),
        outcome: outcome.into(),
        event_timestamp: chrono::Utc.with_ymd_and_hms(2024, 5, 1, 18, 30, 0).unwrap(),
        variant: Some("pre".into()),
        ladder: Some("0.01".into()),
    };

    MarketUid::from_identifier(&identifier).expect("uid generation")
}

#[test]
fn canonical_uid_is_stable() {
    let left = build_uid("Arsenal vs Chelsea", "home");
    let right = build_uid("Arsenal  vs   Chelsea", "HOME");
    assert_eq!(left, right);
    assert!(left.as_str().starts_with("muid-v1-"));
}

#[test]
fn deduplication_drops_duplicates_by_uid_and_side() {
    let uid = build_uid("Arsenal vs Chelsea", "home");
    let primary = MarketRecord::new(uid.clone(), "home", "sx", "sx_home".to_string());
    let alias = MarketRecord::new(uid.clone(), "HOME", "azuro", "az_home".to_string());
    let away = MarketRecord::new(uid.clone(), "away", "sx", "sx_away".to_string());

    let result = deduplicate([primary, alias, away]);

    assert_eq!(result.retained.len(), 2);
    assert_eq!(result.duplicates.len(), 1);
    assert!(result.is_clean() == false);
    assert!(result.duplicate_ratio() > 0.0);
    assert_eq!(result.retained[0].source, "sx");
    assert_eq!(result.retained[1].key.side, "away");
    assert_eq!(result.duplicates[0].source, "azuro");
}

proptest! {
    #[test]
    fn uid_generation_is_idempotent(identifier in identifier_strategy()) {
        let first = MarketUid::from_identifier(&identifier).expect("uid generation");
        let second = MarketUid::from_identifier(&identifier).expect("uid generation");
        prop_assert_eq!(first.as_str(), second.as_str());
        prop_assert!(first.as_str().starts_with("muid-v1-"));
        prop_assert_eq!(first.as_str().len(), "muid-v1-".len() + 24);
    }

    #[test]
    fn dedup_ratio_is_within_bounds(records in prop::collection::vec(record_strategy(), 0..20)) {
        let total = records.len();
        let result = deduplicate(records);
        let ratio = result.duplicate_ratio();
        prop_assert!(ratio >= 0.0);
        prop_assert!(ratio <= 1.0);
        prop_assert_eq!(result.retained.len() + result.duplicates.len(), total);
    }
}

