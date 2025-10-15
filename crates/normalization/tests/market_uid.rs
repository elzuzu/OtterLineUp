use chrono::TimeZone;
use normalization::{
    dedup::{deduplicate, MarketRecord},
    MarketIdentifier, MarketUid,
};

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

