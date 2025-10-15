#![forbid(unsafe_code)]

pub mod error;

pub use error::{AzuroError, AzuroErrorCode};
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AzuroConfig {
    #[serde(alias = "delta_odd_reject")]
    pub delta_odd_reject: f64,
}
impl Default for AzuroConfig {
    fn default() -> Self { Self { delta_odd_reject: 0.02 } }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuoteRequest {
    #[serde(alias = "stake_usd")]
    pub stake: f64,
    #[serde(alias = "amount_token", default, skip_serializing_if = "Option::is_none")]
    pub amount_token: Option<f64>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuoteEngineResponse {
    #[serde(alias = "quoted_odd")]
    pub quoted_odd: f64,
    #[serde(alias = "marginal_odd")]
    pub marginal_odd: f64,
    #[serde(alias = "max_payout_limit")]
    pub max_payout_limit: f64,
    #[serde(alias = "amount_token", default, skip_serializing_if = "Option::is_none")]
    pub amount_token: Option<f64>,
}

pub trait QuoteEngine: Send + Sync {
    fn fetch_quote(&self, request: &QuoteRequest) -> Result<QuoteEngineResponse, AzuroError>;
    fn max_payout(&self) -> Result<f64, AzuroError>;
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuoteSimulation {
    #[serde(alias = "quoted_odd")]
    pub quoted_odd: f64,
    #[serde(alias = "marginal_odd")]
    pub marginal_odd: f64,
    #[serde(alias = "delta")]
    pub delta: f64,
    #[serde(alias = "stake_usd")]
    pub stake: f64,
    #[serde(alias = "amount_token", default, skip_serializing_if = "Option::is_none")]
    pub amount_token: Option<f64>,
    #[serde(alias = "expected_payout")]
    pub expected_payout: f64,
    #[serde(alias = "payout_cap")]
    pub payout_cap: f64,
    #[serde(alias = "payout_headroom")]
    pub payout_headroom: f64,
}

pub struct AzuroClient<E: QuoteEngine> { config: Arc<RwLock<AzuroConfig>>, engine: E }
impl<E: QuoteEngine> AzuroClient<E> {
    pub fn new(config: AzuroConfig, engine: E) -> Self { Self { config: Arc::new(RwLock::new(config)), engine } }
    pub fn config(&self) -> AzuroConfig { self.config.read().clone() }
    pub fn reload_config(&self, next: AzuroConfig) { *self.config.write() = next; }
    pub fn simulate_quote(&self, request: &QuoteRequest) -> Result<QuoteSimulation, AzuroError> {
        if !(request.stake.is_finite() && request.stake > 0.0) {
            return Err(
                AzuroError::new(
                    AzuroErrorCode::Stake,
                    "stake must be a positive finite amount (USD)",
                )
                .with_detail(format!("stake={:.6}", request.stake)),
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
        let payout = request.stake * quote.marginal_odd;
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
            stake: request.stake,
            amount_token: quote.amount_token.or(request.amount_token),
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
    struct TestEngine {
        quote: QuoteEngineResponse,
    }

    impl QuoteEngine for TestEngine {
        fn fetch_quote(&self, _: &QuoteRequest) -> Result<QuoteEngineResponse, AzuroError> {
            Ok(self.quote.clone())
        }

        fn max_payout(&self) -> Result<f64, AzuroError> { Ok(self.quote.max_payout_limit) }
    }

    #[test]
    fn rejects_delta_above_threshold() {
        let engine = TestEngine {
            quote: QuoteEngineResponse { quoted_odd: 1.80, marginal_odd: 1.90, max_payout_limit: 500.0, amount_token: None },
        };
        let client = AzuroClient::new(AzuroConfig { delta_odd_reject: 0.05 }, engine);
        let err = client
            .simulate_quote(&QuoteRequest { stake: 100.0, amount_token: None })
            .expect_err("Δodd should exceed threshold");
        assert_eq!(err.code(), AzuroErrorCode::DeltaOddThreshold);
        assert_eq!(err.code_str(), "E-AZU-ΔODD-THRESH");
    }

    #[test]
    fn accepts_quote_within_threshold() {
        let engine = TestEngine {
            quote: QuoteEngineResponse { quoted_odd: 1.84, marginal_odd: 1.85, max_payout_limit: 1000.0, amount_token: Some(48.5) },
        };
        let client = AzuroClient::new(AzuroConfig::default(), engine);
        let result = client
            .simulate_quote(&QuoteRequest { stake: 50.0, amount_token: None })
            .expect("quote should be accepted");
        assert!((result.delta - 0.01).abs() < f64::EPSILON);
        assert!((result.expected_payout - 92.5).abs() < f64::EPSILON);
        assert!((result.payout_cap - 1000.0).abs() < f64::EPSILON);
        assert!((result.payout_headroom - 907.5).abs() < f64::EPSILON);
        assert_eq!(result.amount_token, Some(48.5));
        assert_eq!(result.stake, 50.0);
    }

    #[test]
    fn rejects_invalid_stake() {
        let engine = TestEngine {
            quote: QuoteEngineResponse { quoted_odd: 1.84, marginal_odd: 1.85, max_payout_limit: 1000.0, amount_token: None },
        };
        let client = AzuroClient::new(AzuroConfig::default(), engine);
        let err = client
            .simulate_quote(&QuoteRequest { stake: 0.0, amount_token: None })
            .expect_err("stake must be positive");
        assert_eq!(err.code(), AzuroErrorCode::Stake);
        assert_eq!(err.code_str(), "E-AZU-STAKE");
    }

    #[test]
    fn rejects_when_payout_exceeds_cap() {
        let engine = TestEngine {
            quote: QuoteEngineResponse { quoted_odd: 1.84, marginal_odd: 2.0, max_payout_limit: 150.0, amount_token: None },
        };
        let client = AzuroClient::new(AzuroConfig::default(), engine);
        let err = client
            .simulate_quote(&QuoteRequest { stake: 100.0, amount_token: None })
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
                Ok(QuoteEngineResponse {
                    quoted_odd: 1.9,
                    marginal_odd: 1.92,
                    max_payout_limit: f64::INFINITY,
                    amount_token: None,
                })
            }

            fn max_payout(&self) -> Result<f64, AzuroError> { Ok(f64::INFINITY) }
        }

        let client = AzuroClient::new(AzuroConfig::default(), InvalidLimitEngine);
        let err = client
            .simulate_quote(&QuoteRequest { stake: 25.0, amount_token: None })
            .expect_err("invalid payout limit should be rejected");
        assert_eq!(err.code(), AzuroErrorCode::Configuration);
        assert!(err.detail().expect("detail").contains("limit=inf"));
    }

    #[test]
    fn reload_config_updates_threshold() {
        let engine = TestEngine {
            quote: QuoteEngineResponse { quoted_odd: 1.80, marginal_odd: 1.86, max_payout_limit: 500.0, amount_token: None },
        };
        let client = AzuroClient::new(AzuroConfig::default(), engine.clone());
        client.reload_config(AzuroConfig { delta_odd_reject: 0.1 });
        let result = client
            .simulate_quote(&QuoteRequest { stake: 50.0, amount_token: None })
            .expect("quote should be accepted after reload");
        assert!((result.delta - 0.06).abs() < f64::EPSILON);
    }

    #[test]
    fn serializes_structs_with_camel_case() {
        let simulation = QuoteSimulation {
            quoted_odd: 1.92,
            marginal_odd: 1.95,
            delta: 0.03,
            stake: 25.0,
            amount_token: Some(24.1),
            expected_payout: 48.75,
            payout_cap: 1000.0,
            payout_headroom: 951.25,
        };
        let value = serde_json::to_value(&simulation).expect("serialize");
        let object = value.as_object().expect("object");
        assert!(object.contains_key("quotedOdd"));
        assert!(object.contains_key("marginalOdd"));
        assert_eq!(object.get("stake").and_then(|v| v.as_f64()), Some(25.0));
        assert!(object.contains_key("amountToken"));
        assert!(!object.contains_key("stakeUsd"));
    }
}
