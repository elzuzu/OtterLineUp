use chrono::{DateTime, Timelike, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fmt;
use thiserror::Error;

const MARKET_UID_PREFIX: &str = "muid";
const MARKET_UID_VERSION: &str = "v1";

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct MarketIdentifier {
    pub operator: String, pub sport: String, pub league: String, pub event: String,
    pub market_type: String, pub outcome: String, pub event_timestamp: DateTime<Utc>,
    pub variant: Option<String>, pub ladder: Option<String>,
}

impl MarketIdentifier {
    pub fn canonical_fingerprint(&self) -> Result<String, MarketUidError> {
        let operator = normalize_required(&self.operator, "operator")?;
        let sport = normalize_required(&self.sport, "sport")?;
        let league = normalize_required(&self.league, "league")?;
        let event = normalize_required(&self.event, "event")?;
        let market_type = normalize_required(&self.market_type, "market_type")?;
        let outcome = normalize_required(&self.outcome, "outcome")?;
        let ladder = normalize_optional(self.ladder.as_deref());
        let variant = normalize_optional(self.variant.as_deref());
        let event_time = truncate_timestamp(self.event_timestamp);

        Ok(format!(
            "{MARKET_UID_PREFIX}|{MARKET_UID_VERSION}|{operator}|{sport}|{league}|{event}|{market_type}|{variant}|{ladder}|{event_time}|{outcome}"
        ))
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct MarketUid(String);

impl MarketUid {
    pub fn from_identifier(identifier: &MarketIdentifier) -> Result<Self, MarketUidError> {
        let fingerprint = identifier.canonical_fingerprint()?;
        let mut hasher = Sha256::new();
        hasher.update(fingerprint.as_bytes());
        let digest = hasher.finalize();
        let hash = hex::encode(digest);
        let value = format!("{MARKET_UID_PREFIX}-{MARKET_UID_VERSION}-{}", &hash[..24]);
        Ok(Self(value))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl fmt::Display for MarketUid {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

#[derive(Debug, Error)]
pub enum MarketUidError {
    #[error("missing required field `{0}` for market UID generation")]
    MissingField(&'static str),
}

fn normalize_required(value: &str, field: &'static str) -> Result<String, MarketUidError> {
    let cleaned = value.trim();
    if cleaned.is_empty() {
        Err(MarketUidError::MissingField(field))
    } else {
        Ok(canonicalize(cleaned))
    }
}

fn normalize_optional(value: Option<&str>) -> String {
    value
        .map(|v| canonicalize(v.trim()))
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| "na".to_string())
}

fn truncate_timestamp(timestamp: DateTime<Utc>) -> String {
    timestamp
        .with_second(0)
        .and_then(|dt| dt.with_nanosecond(0))
        .unwrap_or(timestamp)
        .format("%Y%m%dT%H%MZ")
        .to_string()
}

fn canonicalize(input: &str) -> String {
    let normalized: String = input
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c.to_ascii_lowercase() } else { ' ' })
        .collect();
    normalized
        .split_whitespace()
        .map(str::to_string)
        .collect::<Vec<_>>()
        .join("_")
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    #[test]
    fn market_uid_generation_behaves() {
        let identifier = MarketIdentifier { operator: "sx".into(), sport: "Soccer".into(), league: "Premier League".into(), event: "Arsenal vs Chelsea".into(), market_type: "moneyline".into(), outcome: "home".into(), event_timestamp: Utc.with_ymd_and_hms(2024, 5, 1, 18, 30, 45).unwrap(), variant: Some("pre".into()), ladder: None };
        let uid = MarketUid::from_identifier(&identifier).unwrap();
        assert!(uid.as_str().starts_with("muid-v1-"));

        let missing_operator = MarketIdentifier { operator: "".into(), sport: "Soccer".into(), league: "Premier League".into(), event: "Arsenal vs Chelsea".into(), market_type: "moneyline".into(), outcome: "home".into(), event_timestamp: Utc::now(), variant: None, ladder: None };
        let error = MarketUid::from_identifier(&missing_operator).unwrap_err();
        assert!(matches!(error, MarketUidError::MissingField("operator")));
    }
}
