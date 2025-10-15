use std::collections::HashSet;

use crate::market_uid::MarketUid;

/// Key composed of a market UID and normalized side label.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct DedupKey {
    pub uid: MarketUid,
    pub side: String,
}

impl DedupKey {
    pub fn new(uid: MarketUid, side: impl AsRef<str>) -> Self {
        Self { uid, side: normalize_side(side.as_ref()) }
    }
}

/// Record flowing through the deduplication pipeline.
#[derive(Clone, Debug)]
pub struct MarketRecord<T> {
    pub key: DedupKey,
    pub source: String,
    pub payload: T,
}

impl<T> MarketRecord<T> {
    pub fn new(uid: MarketUid, side: impl AsRef<str>, source: impl Into<String>, payload: T) -> Self {
        let key = DedupKey::new(uid, side);
        Self { key, source: source.into(), payload }
    }
}

/// Outcome of the deduplication pass.
#[derive(Clone, Debug, Default)]
pub struct DedupResult<T> {
    pub retained: Vec<MarketRecord<T>>,
    pub duplicates: Vec<MarketRecord<T>>,
}

impl<T> DedupResult<T> {
    pub fn is_clean(&self) -> bool {
        self.duplicates.is_empty()
    }

    pub fn duplicate_ratio(&self) -> f64 {
        let kept = self.retained.len() as f64;
        let dup = self.duplicates.len() as f64;
        if kept + dup == 0.0 { 0.0 } else { dup / (kept + dup) }
    }
}

/// Deduplicate records by Market UID + side while preserving first-seen priority.
pub fn deduplicate<T>(records: impl IntoIterator<Item = MarketRecord<T>>) -> DedupResult<T> {
    let mut seen = HashSet::new();
    let mut retained = Vec::new();
    let mut duplicates = Vec::new();

    for record in records {
        if seen.insert(record.key.clone()) {
            retained.push(record);
        } else {
            duplicates.push(record);
        }
    }

    DedupResult { retained, duplicates }
}

fn normalize_side(value: &str) -> String {
    value
        .trim()
        .to_ascii_lowercase()
        .split_whitespace()
        .filter(|segment| !segment.is_empty())
        .collect::<Vec<_>>()
        .join("_")
}

