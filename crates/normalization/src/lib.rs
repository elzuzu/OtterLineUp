//! Normalization toolkit for cross-operator market identifiers.

pub mod dedup;
pub mod market_uid;

pub use dedup::{deduplicate, DedupKey, DedupResult, MarketRecord};
pub use market_uid::{MarketIdentifier, MarketUid, MarketUidError};
