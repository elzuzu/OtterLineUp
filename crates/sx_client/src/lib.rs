use std::{sync::Arc, time::{Duration, Instant}};

use async_trait::async_trait;
use thiserror::Error;
use tokio::{sync::RwLock, time};

pub type Result<T> = std::result::Result<T, SxClientError>;

#[derive(Clone)]
pub struct SxClient {
    ttl: Duration,
    metadata: Arc<dyn MetadataProvider>,
    quotes: Arc<dyn QuoteSource>,
    executor: Arc<dyn OrderExecutor>,
    cached_metadata: Arc<RwLock<Option<SxMetadata>>>,
}

impl SxClient {
    pub fn new(ttl: Duration, metadata: Arc<dyn MetadataProvider>, quotes: Arc<dyn QuoteSource>, executor: Arc<dyn OrderExecutor>) -> Self {
        Self { ttl, metadata, quotes, executor, cached_metadata: Arc::new(RwLock::new(None)) }
    }

    pub async fn get_best_quote(&self, request: QuoteRequest) -> Result<Quote> {
        let meta = self.load_metadata().await?;
        let mut quote = self.quotes.best_quote(&request).await?;
        quote.odds = align_to_ladder(quote.odds, meta.odds_ladder_step)?;
        Ok(quote)
    }

    pub async fn place_bet(&self, request: BetRequest) -> Result<BetExecution> {
        let meta = self.load_metadata().await?;
        if request.odds_slippage > meta.max_odds_slippage {
            return Err(SxClientError::SlippageExceeded { requested: request.odds_slippage, max: meta.max_odds_slippage });
        }
        let prepared = PreparedOrder { market_uid: request.market_uid.clone(), side: request.side.clone(), odds: align_to_ladder(request.odds, meta.odds_ladder_step)?, stake: request.stake, odds_slippage: request.odds_slippage, heartbeat: meta.heartbeat, betting_delay: meta.betting_delay };
        let total_timeout = meta
            .betting_delay
            .checked_add(meta.heartbeat)
            .unwrap_or(Duration::MAX);
        let response = match time::timeout(total_timeout, self.executor.submit(prepared)).await {
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

    async fn load_metadata(&self) -> Result<SxMetadata> {
        if let Some(meta) = self.cached_metadata.read().await.clone() {
            if self.ensure_metadata(&meta).is_ok() {
                return Ok(meta);
            }
        }

        let fresh = self.metadata.latest().await?;
        self.ensure_metadata(&fresh)?;

        let mut guard = self.cached_metadata.write().await;
        if let Some(meta) = guard.as_ref() {
            if self.ensure_metadata(meta).is_ok() {
                return Ok(meta.clone());
            }
        }
        *guard = Some(fresh.clone());
        Ok(fresh)
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
#[derive(Debug, Clone, PartialEq)]
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};
    use std::sync::atomic::{AtomicUsize, Ordering};

    #[derive(Clone)]
    struct StaticMetadata(SxMetadata);
    #[async_trait]
    impl MetadataProvider for StaticMetadata {
        async fn latest(&self) -> Result<SxMetadata> { Ok(self.0.clone()) }
    }

    #[derive(Clone)]
    struct SequenceMetadata {
        calls: Arc<AtomicUsize>,
        snapshots: Arc<Mutex<Vec<SxMetadata>>>,
    }

    impl SequenceMetadata {
        fn new(snapshots: Vec<SxMetadata>) -> Self {
            Self { calls: Arc::new(AtomicUsize::new(0)), snapshots: Arc::new(Mutex::new(snapshots)) }
        }

        fn call_count(&self) -> usize { self.calls.load(Ordering::SeqCst) }
    }

    #[async_trait]
    impl MetadataProvider for SequenceMetadata {
        async fn latest(&self) -> Result<SxMetadata> {
            let idx = self.calls.fetch_add(1, Ordering::SeqCst);
            let snapshots = self.snapshots.lock().expect("snapshots");
            Ok(snapshots.get(idx).cloned().unwrap_or_else(|| snapshots.last().expect("at least one snapshot").clone()))
        }
    }

    #[derive(Clone)]
    struct StaticQuote(Quote);
    #[async_trait]
    impl QuoteSource for StaticQuote {
        async fn best_quote(&self, _request: &QuoteRequest) -> Result<Quote> { Ok(self.0.clone()) }
    }

    #[derive(Clone)]
    struct StaticExecutor(OrderResponse);
    #[async_trait]
    impl OrderExecutor for StaticExecutor {
        async fn submit(&self, _order: PreparedOrder) -> Result<OrderResponse> { Ok(self.0.clone()) }
    }

    #[derive(Clone)]
    struct SlowExecutor(Duration);
    #[async_trait]
    impl OrderExecutor for SlowExecutor {
        async fn submit(&self, _order: PreparedOrder) -> Result<OrderResponse> {
            time::sleep(self.0).await;
            Ok(OrderResponse { status: OrderStatus::Accepted, fills: vec![] })
        }
    }

    #[derive(Clone)]
    struct DelayedExecutor {
        delay: Duration,
        response: OrderResponse,
    }

    #[async_trait]
    impl OrderExecutor for DelayedExecutor {
        async fn submit(&self, _order: PreparedOrder) -> Result<OrderResponse> {
            time::sleep(self.delay).await;
            Ok(self.response.clone())
        }
    }

    fn base_metadata() -> SxMetadata {
        SxMetadata {
            odds_ladder_step: 0.05,
            betting_delay: Duration::from_secs(5),
            heartbeat: Duration::from_secs(30),
            max_odds_slippage: 0.03,
            fetched_at: Instant::now(),
        }
    }

    fn client(meta: SxMetadata, quote: Arc<dyn QuoteSource>, exec: Arc<dyn OrderExecutor>) -> SxClient {
        client_with_ttl(Duration::from_secs(60), meta, quote, exec)
    }

    fn client_with_ttl(ttl: Duration, meta: SxMetadata, quote: Arc<dyn QuoteSource>, exec: Arc<dyn OrderExecutor>) -> SxClient {
        SxClient::new(ttl, Arc::new(StaticMetadata(meta)), quote, exec)
    }

    #[tokio::test]
    async fn get_best_quote_aligns_to_ladder() {
        let mut metadata = base_metadata();
        metadata.heartbeat = Duration::from_secs(10);
        metadata.max_odds_slippage = 0.02;
        let quote = Quote { market_uid: "m1".into(), side: "back".into(), odds: 1.934, available_stake: 100.0 };
        let client = client(metadata, Arc::new(StaticQuote(quote)), Arc::new(StaticExecutor(OrderResponse { status: OrderStatus::Accepted, fills: vec![] })));
        let quote = client.get_best_quote(QuoteRequest { market_uid: "m1".into(), side: "back".into(), stake: 50.0 }).await.expect("quote");
        assert!((quote.odds - 1.95).abs() < 1e-9);
    }

    #[tokio::test]
    async fn place_bet_marks_partial_fill() {
        let metadata = base_metadata();
        let fills = vec![Fill { fill_id: "f1".into(), filled_stake: 60.0, odds: 1.92, accepted_at: Instant::now() }];
        let executor = StaticExecutor(OrderResponse { status: OrderStatus::Accepted, fills: fills.clone() });
        let client = client(metadata, Arc::new(StaticQuote(Quote { market_uid: "m1".into(), side: "back".into(), odds: 1.9, available_stake: 0.0 })), Arc::new(executor));
        let execution = client
            .place_bet(BetRequest { market_uid: "m1".into(), side: "back".into(), odds: 1.91, stake: 100.0, odds_slippage: 0.02 })
            .await
            .expect("bet execution");
        assert_eq!(execution.status, OrderStatus::PartiallyAccepted);
        assert!((execution.remaining_stake - 40.0).abs() < f64::EPSILON);
        assert_eq!(execution.fills, fills);
    }

    #[tokio::test]
    async fn place_bet_times_out_on_heartbeat() {
        let mut metadata = base_metadata();
        metadata.heartbeat = Duration::from_millis(20);
        metadata.betting_delay = Duration::from_millis(5);
        let client = client(metadata, Arc::new(StaticQuote(Quote { market_uid: "m1".into(), side: "lay".into(), odds: 1.9, available_stake: 0.0 })), Arc::new(SlowExecutor(Duration::from_millis(40))));
        let result = client
            .place_bet(BetRequest { market_uid: "m1".into(), side: "lay".into(), odds: 1.9, stake: 10.0, odds_slippage: 0.01 })
            .await;
        assert!(matches!(result, Err(SxClientError::HeartbeatTimeout)));
    }

    #[tokio::test]
    async fn place_bet_allows_betting_delay_grace() {
        let mut metadata = base_metadata();
        metadata.heartbeat = Duration::from_millis(40);
        metadata.betting_delay = Duration::from_millis(60);
        let fills = vec![Fill { fill_id: "f1".into(), filled_stake: 10.0, odds: 1.91, accepted_at: Instant::now() }];
        let executor = DelayedExecutor { delay: Duration::from_millis(80), response: OrderResponse { status: OrderStatus::Accepted, fills: fills.clone() } };
        let client = client(metadata, Arc::new(StaticQuote(Quote { market_uid: "m2".into(), side: "back".into(), odds: 2.0, available_stake: 50.0 })), Arc::new(executor));
        let execution = client
            .place_bet(BetRequest { market_uid: "m2".into(), side: "back".into(), odds: 1.95, stake: 10.0, odds_slippage: 0.02 })
            .await
            .expect("bet execution");
        assert_eq!(execution.status, OrderStatus::Accepted);
        assert!((execution.remaining_stake).abs() < f64::EPSILON);
        assert_eq!(execution.fills, fills);
    }

    #[tokio::test]
    async fn metadata_stale_is_rejected() {
        let mut metadata = base_metadata();
        metadata.fetched_at = Instant::now() - Duration::from_secs(61);
        let client = client(metadata, Arc::new(StaticQuote(Quote { market_uid: "m1".into(), side: "back".into(), odds: 1.9, available_stake: 0.0 })), Arc::new(StaticExecutor(OrderResponse { status: OrderStatus::Accepted, fills: vec![] })));
        let result = client.get_best_quote(QuoteRequest { market_uid: "m1".into(), side: "back".into(), stake: 10.0 }).await;
        assert!(matches!(result, Err(SxClientError::MetadataStale { .. })));
    }

    #[tokio::test]
    async fn metadata_is_cached_until_ttl_expires() {
        let quote = Arc::new(StaticQuote(Quote { market_uid: "m1".into(), side: "back".into(), odds: 1.9, available_stake: 50.0 }));
        let exec = Arc::new(StaticExecutor(OrderResponse { status: OrderStatus::Accepted, fills: vec![] }));
        let now = Instant::now();
        let snapshots = vec![
            SxMetadata { fetched_at: now, ..base_metadata() },
            SxMetadata { fetched_at: now + Duration::from_millis(20), ..base_metadata() },
        ];
        let provider = SequenceMetadata::new(snapshots);
        let client = SxClient::new(Duration::from_millis(15), Arc::new(provider.clone()), quote.clone(), exec.clone());

        client.get_best_quote(QuoteRequest { market_uid: "m1".into(), side: "back".into(), stake: 10.0 }).await.expect("first quote");
        client.get_best_quote(QuoteRequest { market_uid: "m1".into(), side: "back".into(), stake: 10.0 }).await.expect("second quote");
        assert_eq!(provider.call_count(), 1, "metadata should be cached within TTL");

        time::sleep(Duration::from_millis(16)).await;
        client.get_best_quote(QuoteRequest { market_uid: "m1".into(), side: "back".into(), stake: 10.0 }).await.expect("third quote");
        assert_eq!(provider.call_count(), 2, "metadata should refresh after TTL");
    }
}
