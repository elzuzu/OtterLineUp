#![forbid(unsafe_code)]

pub mod error;

pub use error::{AzuroError, AzuroErrorCode};
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use thiserror::Error;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AzuroConfig { pub delta_odd_reject: f64 }
impl Default for AzuroConfig {
    fn default() -> Self { Self { delta_odd_reject: 0.02 } }
}

#[derive(Debug, Clone)]
pub struct QuoteRequest { pub stake_usd: f64 }
#[derive(Debug, Clone)]
pub struct QuoteEngineResponse { pub quoted_odd: f64, pub marginal_odd: f64, pub max_payout_limit: f64 }

pub trait QuoteEngine: Send + Sync {
    fn fetch_quote(&self, request: &QuoteRequest) -> Result<QuoteEngineResponse, AzuroError>;
    fn max_payout(&self) -> Result<f64, AzuroError>;
}

#[derive(Debug, Clone)]
pub struct QuoteSimulation {
    pub quoted_odd: f64,
    pub marginal_odd: f64,
    pub delta: f64,
    pub stake_usd: f64,
    pub expected_payout: f64,
}

#[derive(Debug, Error)]
pub enum AzuroError {
    #[error("simulation rejected: stake must be positive, received {stake_usd}")]
    InvalidStake { stake_usd: f64 },
    #[error("simulation rejected: delta odd {delta:.4} exceeds threshold {threshold:.4}")]
    DeltaOddExceeded { delta: f64, threshold: f64 },
    #[error("max payout exceeded: payout {payout:.2} exceeds limit {limit:.2}")]
    MaxPayoutExceeded { payout: f64, limit: f64 },
    #[error("quote engine error: {message}")]
    Engine { message: String },
}
impl AzuroError {
    pub fn engine<E: std::fmt::Display>(err: E) -> Self { Self::Engine { message: err.to_string() } }
}

pub struct AzuroClient<E: QuoteEngine> { config: Arc<RwLock<AzuroConfig>>, engine: E }
impl<E: QuoteEngine> AzuroClient<E> {
    pub fn new(config: AzuroConfig, engine: E) -> Self { Self { config: Arc::new(RwLock::new(config)), engine } }
    pub fn config(&self) -> AzuroConfig { self.config.read().clone() }
    pub fn reload_config(&self, next: AzuroConfig) { *self.config.write() = next; }
    pub fn simulate_quote(&self, request: &QuoteRequest) -> Result<QuoteSimulation, AzuroError> {
        if !(request.stake_usd.is_finite() && request.stake_usd > 0.0) {
            return Err(AzuroError::InvalidStake { stake_usd: request.stake_usd });
        }
        let config = self.config();
        let quote = self.engine.fetch_quote(request)?;
        let payout_limit = self.engine.max_payout()?;
        let payout = request.stake_usd * quote.marginal_odd;
        if payout > payout_limit {
            return Err(AzuroError::MaxPayoutExceeded { payout, limit: payout_limit });
        }
        let delta = (quote.marginal_odd - quote.quoted_odd).abs();
        if delta > config.delta_odd_reject {
            return Err(AzuroError::DeltaOddExceeded { delta, threshold: config.delta_odd_reject });
        }
        Ok(QuoteSimulation { quoted_odd: quote.quoted_odd, marginal_odd: quote.marginal_odd, delta, stake_usd: request.stake_usd, expected_payout: payout })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Clone)]
    struct TestEngine { quote: QuoteEngineResponse }
    impl QuoteEngine for TestEngine {
        fn fetch_quote(&self, _: &QuoteRequest) -> Result<QuoteEngineResponse, AzuroError> { Ok(self.quote.clone()) }
        fn max_payout(&self) -> Result<f64, AzuroError> { Ok(self.quote.max_payout_limit) }
    }

    #[test]
    fn rejects_delta_above_threshold() {
        let engine = TestEngine { quote: QuoteEngineResponse { quoted_odd: 1.80, marginal_odd: 1.90, max_payout_limit: 500.0 } };
        let client = AzuroClient::new(AzuroConfig { delta_odd_reject: 0.05 }, engine);
        assert!(matches!(
            client.simulate_quote(&QuoteRequest { stake_usd: 100.0 }),
            Err(AzuroError::DeltaOddExceeded { .. })
        ));
    }

    #[test]
    fn accepts_quote_within_threshold() {
        let engine = TestEngine { quote: QuoteEngineResponse { quoted_odd: 1.84, marginal_odd: 1.85, max_payout_limit: 1000.0 } };
        let client = AzuroClient::new(AzuroConfig::default(), engine);
        let result = client
            .simulate_quote(&QuoteRequest { stake_usd: 50.0 })
            .expect("quote should be accepted");
        assert!((result.delta - 0.01).abs() < f64::EPSILON);
        assert!((result.expected_payout - 92.5).abs() < f64::EPSILON);
    }
}
