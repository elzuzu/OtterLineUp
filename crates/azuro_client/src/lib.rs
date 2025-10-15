#![forbid(unsafe_code)]

pub mod error;

pub use error::{AzuroError, AzuroErrorCode};
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

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
    pub payout_cap: f64,
    pub payout_headroom: f64,
}

pub struct AzuroClient<E: QuoteEngine> { config: Arc<RwLock<AzuroConfig>>, engine: E }
impl<E: QuoteEngine> AzuroClient<E> {
    pub fn new(config: AzuroConfig, engine: E) -> Self { Self { config: Arc::new(RwLock::new(config)), engine } }
    pub fn config(&self) -> AzuroConfig { self.config.read().clone() }
    pub fn reload_config(&self, next: AzuroConfig) { *self.config.write() = next; }
    pub fn simulate_quote(&self, request: &QuoteRequest) -> Result<QuoteSimulation, AzuroError> {
        if !(request.stake_usd.is_finite() && request.stake_usd > 0.0) {
            return Err(
                AzuroError::new(
                    AzuroErrorCode::Stake,
                    "stake must be a positive finite amount (USD)",
                )
                .with_detail(format!("stake_usd={:.6}", request.stake_usd)),
            );
        }
        let config = self.config();
        let quote = self.engine.fetch_quote(request)?;
        let payout_limit = self.engine.max_payout()?;
        if !(payout_limit.is_finite() && payout_limit > 0.0) {
            return Err(
                AzuroError::new(
                    AzuroErrorCode::Configuration,
                    "max payout must be a positive finite amount",
                )
                .with_detail(format!("limit={payout_limit}")),
            );
        }
        let payout = request.stake_usd * quote.marginal_odd;
        if payout > payout_limit {
            return Err(
                AzuroError::new(AzuroErrorCode::MaxPayout, "max payout exceeded")
                    .with_detail(format!("payout={payout:.2}, limit={payout_limit:.2}")),
            );
        }
        let delta = (quote.marginal_odd - quote.quoted_odd).abs();
        if delta > config.delta_odd_reject {
            return Err(
                AzuroError::new(
                    AzuroErrorCode::DeltaOddThreshold,
                    "Δodd above configured threshold",
                )
                .with_detail(format!(
                    "delta={delta:.6}, threshold={:.6}",
                    config.delta_odd_reject
                )),
            );
        }
        Ok(QuoteSimulation {
            quoted_odd: quote.quoted_odd,
            marginal_odd: quote.marginal_odd,
            delta,
            stake_usd: request.stake_usd,
            expected_payout: payout,
            payout_cap: payout_limit,
            payout_headroom: (payout_limit - payout).max(0.0),
        })
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
        let err = client
            .simulate_quote(&QuoteRequest { stake_usd: 100.0 })
            .expect_err("Δodd should exceed threshold");
        assert_eq!(err.code(), AzuroErrorCode::DeltaOddThreshold);
        assert_eq!(err.code_str(), "E-AZU-ΔODD-THRESH");
    }

    #[test]
    fn accepts_quote_within_threshold() {
        let engine = TestEngine {
            quote: QuoteEngineResponse { quoted_odd: 1.84, marginal_odd: 1.85, max_payout_limit: 1000.0 },
        };
        let client = AzuroClient::new(AzuroConfig::default(), engine);
        let result = client
            .simulate_quote(&QuoteRequest { stake_usd: 50.0 })
            .expect("quote should be accepted");
        assert!((result.delta - 0.01).abs() < f64::EPSILON);
        assert!((result.expected_payout - 92.5).abs() < f64::EPSILON);
        assert!((result.payout_cap - 1000.0).abs() < f64::EPSILON);
        assert!((result.payout_headroom - 907.5).abs() < f64::EPSILON);
    }

    #[test]
    fn rejects_invalid_stake() {
        let engine = TestEngine {
            quote: QuoteEngineResponse { quoted_odd: 1.84, marginal_odd: 1.85, max_payout_limit: 1000.0 },
        };
        let client = AzuroClient::new(AzuroConfig::default(), engine);
        let err = client
            .simulate_quote(&QuoteRequest { stake_usd: 0.0 })
            .expect_err("stake must be positive");
        assert_eq!(err.code(), AzuroErrorCode::Stake);
        assert_eq!(err.code_str(), "E-AZU-STAKE");
    }

    #[test]
    fn rejects_when_payout_exceeds_cap() {
        let engine = TestEngine {
            quote: QuoteEngineResponse { quoted_odd: 1.84, marginal_odd: 2.0, max_payout_limit: 150.0 },
        };
        let client = AzuroClient::new(AzuroConfig::default(), engine);
        let err = client
            .simulate_quote(&QuoteRequest { stake_usd: 100.0 })
            .expect_err("payout should exceed cap");
        assert_eq!(err.code(), AzuroErrorCode::MaxPayout);
        assert!(err
            .detail()
            .expect("detail")
            .contains("limit=150.00"));
    }

    #[test]
    fn rejects_when_payout_limit_invalid() {
        #[derive(Clone)]
        struct InvalidLimitEngine;
        impl QuoteEngine for InvalidLimitEngine {
            fn fetch_quote(&self, _: &QuoteRequest) -> Result<QuoteEngineResponse, AzuroError> {
                Ok(QuoteEngineResponse { quoted_odd: 1.9, marginal_odd: 1.92, max_payout_limit: f64::INFINITY })
            }
            fn max_payout(&self) -> Result<f64, AzuroError> { Ok(f64::INFINITY) }
        }

        let client = AzuroClient::new(AzuroConfig::default(), InvalidLimitEngine);
        let err = client
            .simulate_quote(&QuoteRequest { stake_usd: 25.0 })
            .expect_err("invalid payout limit should be rejected");
        assert_eq!(err.code(), AzuroErrorCode::Configuration);
        assert!(err.detail().expect("detail").contains("limit=inf"));
    }

    #[test]
    fn reload_config_updates_threshold() {
        let engine = TestEngine {
            quote: QuoteEngineResponse { quoted_odd: 1.80, marginal_odd: 1.86, max_payout_limit: 500.0 },
        };
        let client = AzuroClient::new(AzuroConfig::default(), engine.clone());
        client.reload_config(AzuroConfig { delta_odd_reject: 0.1 });
        let result = client
            .simulate_quote(&QuoteRequest { stake_usd: 50.0 })
            .expect("quote should be accepted after reload");
        assert!((result.delta - 0.06).abs() < f64::EPSILON);
    }
}
