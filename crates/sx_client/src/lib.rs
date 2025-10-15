use std::{sync::Arc, time::{Duration, Instant}};

use async_trait::async_trait;
use thiserror::Error;
use tokio::time;

pub type Result<T> = std::result::Result<T, SxClientError>;

#[derive(Clone)]
pub struct SxClient {
    ttl: Duration,
    metadata: Arc<dyn MetadataProvider>,
    quotes: Arc<dyn QuoteSource>,
    executor: Arc<dyn OrderExecutor>,
}

impl SxClient {
    pub fn new(ttl: Duration, metadata: Arc<dyn MetadataProvider>, quotes: Arc<dyn QuoteSource>, executor: Arc<dyn OrderExecutor>) -> Self {
        Self { ttl, metadata, quotes, executor }
    }

    pub async fn get_best_quote(&self, request: QuoteRequest) -> Result<Quote> {
        let meta = self.metadata.latest().await?;
        self.ensure_metadata(&meta)?;
        let mut quote = self.quotes.best_quote(&request).await?;
        quote.odds = align_to_ladder(quote.odds, meta.odds_ladder_step)?;
        Ok(quote)
    }

    pub async fn place_bet(&self, request: BetRequest) -> Result<BetExecution> {
        let meta = self.metadata.latest().await?;
        self.ensure_metadata(&meta)?;
        if request.odds_slippage > meta.max_odds_slippage {
            return Err(SxClientError::SlippageExceeded { requested: request.odds_slippage, max: meta.max_odds_slippage });
        }
        let prepared = PreparedOrder { market_uid: request.market_uid.clone(), side: request.side.clone(), odds: align_to_ladder(request.odds, meta.odds_ladder_step)?, stake: request.stake, odds_slippage: request.odds_slippage, heartbeat: meta.heartbeat, betting_delay: meta.betting_delay };
        let response = match time::timeout(meta.heartbeat, self.executor.submit(prepared)).await {
            Ok(res) => res?,
            Err(_) => return Err(SxClientError::HeartbeatTimeout),
        };
        let filled: f64 = response.fills.iter().map(|f| f.filled_stake).sum();
        let remaining = (request.stake - filled).max(0.0);
        let status = if remaining <= f64::EPSILON && matches!(response.status, OrderStatus::Accepted) {
            OrderStatus::Accepted
        } else if filled > 0.0 {
            OrderStatus::PartiallyAccepted
        } else {
            OrderStatus::Void
        };
        Ok(BetExecution { status, fills: response.fills, requested_stake: request.stake, remaining_stake: remaining })
    }

    fn ensure_metadata(&self, metadata: &SxMetadata) -> Result<()> {
        let age = Instant::now().saturating_duration_since(metadata.fetched_at);
        if age > self.ttl {
            return Err(SxClientError::MetadataStale { age });
        }
        if metadata.odds_ladder_step <= 0.0 {
            return Err(SxClientError::InvalidMetadata("odds_ladder_step".into()));
        }
        Ok(())
    }
}

#[async_trait]
pub trait MetadataProvider: Send + Sync { async fn latest(&self) -> Result<SxMetadata>; }
#[async_trait]
pub trait QuoteSource: Send + Sync { async fn best_quote(&self, request: &QuoteRequest) -> Result<Quote>; }
#[async_trait]
pub trait OrderExecutor: Send + Sync { async fn submit(&self, order: PreparedOrder) -> Result<OrderResponse>; }

#[derive(Debug, Clone)]
pub struct QuoteRequest { pub market_uid: String, pub side: String, pub stake: f64 }
#[derive(Debug, Clone)]
pub struct Quote { pub market_uid: String, pub side: String, pub odds: f64, pub available_stake: f64 }
#[derive(Debug, Clone)]
pub struct BetRequest { pub market_uid: String, pub side: String, pub odds: f64, pub stake: f64, pub odds_slippage: f64 }
#[derive(Debug, Clone)]
pub struct BetExecution { pub status: OrderStatus, pub fills: Vec<Fill>, pub requested_stake: f64, pub remaining_stake: f64 }
#[derive(Debug, Clone)]
pub struct Fill { pub fill_id: String, pub filled_stake: f64, pub odds: f64, pub accepted_at: Instant }
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OrderStatus { Accepted, PartiallyAccepted, Void }
#[derive(Debug, Clone)]
pub struct SxMetadata { pub odds_ladder_step: f64, pub betting_delay: Duration, pub heartbeat: Duration, pub max_odds_slippage: f64, pub fetched_at: Instant }
#[derive(Debug, Clone)]
pub struct PreparedOrder { pub market_uid: String, pub side: String, pub odds: f64, pub stake: f64, pub odds_slippage: f64, pub heartbeat: Duration, pub betting_delay: Duration }
#[derive(Debug, Clone)]
pub struct OrderResponse { pub status: OrderStatus, pub fills: Vec<Fill> }

#[derive(Debug, Error)]
pub enum SxClientError {
    #[error("metadata stale after {age:?}")] MetadataStale { age: Duration },
    #[error("invalid metadata: {0}")] InvalidMetadata(String),
    #[error("requested slippage {requested} > max {max}")] SlippageExceeded { requested: f64, max: f64 },
    #[error("odds {odds} incompatible with ladder step {step}")] OddsOutOfLadder { odds: f64, step: f64 },
    #[error("heartbeat timeout")] HeartbeatTimeout,
}

impl SxClientError {
    pub fn code(&self) -> &'static str {
        match self {
            SxClientError::MetadataStale { .. } => "E-SX-METADATA-STALE",
            SxClientError::InvalidMetadata(_) => "E-SX-METADATA-INVALID",
            SxClientError::SlippageExceeded { .. } => "E-SX-ODDS-SLIPPAGE",
            SxClientError::OddsOutOfLadder { .. } => "E-SX-ODDS-LADDER",
            SxClientError::HeartbeatTimeout => "E-SX-PARTIAL-TIMEOUT",
        }
    }
}

fn align_to_ladder(odds: f64, step: f64) -> Result<f64> {
    if step <= 0.0 {
        return Err(SxClientError::InvalidMetadata("odds_ladder_step".into()));
    }
    if !odds.is_finite() {
        return Err(SxClientError::OddsOutOfLadder { odds, step });
    }
    Ok((odds / step).round() * step)
}
