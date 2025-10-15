use rust_decimal::prelude::*;
use rust_decimal::Decimal;
use thiserror::Error;

const HUNDRED: Decimal = Decimal::ONE_HUNDRED;

#[derive(Debug, Error, PartialEq, Eq)]
pub enum ConversionError {
    #[error("probability must be between 0 and 1 exclusive")]
    InvalidProbability,
    #[error("decimal odds must be greater than 1")]
    InvalidDecimal,
    #[error("american odds cannot be zero")]
    InvalidAmerican,
    #[error("commission must be between 0 and 1 exclusive")]
    InvalidCommission,
    #[error("total implied probability must be positive")]
    InvalidProbabilityTotal,
}

fn validate_decimal(decimal_odds: Decimal) -> Result<(), ConversionError> {
    if decimal_odds <= Decimal::ONE {
        return Err(ConversionError::InvalidDecimal);
    }
    Ok(())
}

fn validate_commission(rate: Decimal) -> Result<(), ConversionError> {
    if rate < Decimal::ZERO || rate >= Decimal::ONE {
        return Err(ConversionError::InvalidCommission);
    }
    Ok(())
}

pub fn decimal_from_probability(probability: Decimal) -> Result<Decimal, ConversionError> {
    if probability <= Decimal::ZERO || probability >= Decimal::ONE {
        return Err(ConversionError::InvalidProbability);
    }
    Ok(Decimal::ONE / probability)
}

pub fn probability_from_decimal(decimal_odds: Decimal) -> Result<Decimal, ConversionError> {
    validate_decimal(decimal_odds)?;
    Ok(Decimal::ONE / decimal_odds)
}

pub fn decimal_from_american(american_odds: i32) -> Result<Decimal, ConversionError> {
    if american_odds == 0 {
        return Err(ConversionError::InvalidAmerican);
    }
    if american_odds > 0 {
        Ok(Decimal::ONE + Decimal::from(american_odds) / HUNDRED)
    } else {
        Ok(Decimal::ONE + HUNDRED / Decimal::from(-american_odds))
    }
}

pub fn american_from_decimal(decimal_odds: Decimal) -> Result<i32, ConversionError> {
    validate_decimal(decimal_odds)?;
    let value = if decimal_odds >= Decimal::from(2) {
        (decimal_odds - Decimal::ONE) * HUNDRED
    } else {
        -HUNDRED / (decimal_odds - Decimal::ONE)
    };
    value.round().to_i32().ok_or(ConversionError::InvalidDecimal)
}

pub fn decimal_after_commission(
    decimal_odds: Decimal,
    commission_rate: Decimal,
) -> Result<Decimal, ConversionError> {
    validate_decimal(decimal_odds)?;
    validate_commission(commission_rate)?;
    let multiplier = Decimal::ONE - commission_rate;
    Ok(Decimal::ONE + (decimal_odds - Decimal::ONE) * multiplier)
}

pub fn decimal_before_commission(
    net_decimal_odds: Decimal,
    commission_rate: Decimal,
) -> Result<Decimal, ConversionError> {
    validate_decimal(net_decimal_odds)?;
    validate_commission(commission_rate)?;
    let multiplier = Decimal::ONE - commission_rate;
    if multiplier <= Decimal::ZERO {
        return Err(ConversionError::InvalidCommission);
    }
    Ok(Decimal::ONE + (net_decimal_odds - Decimal::ONE) / multiplier)
}

pub fn decimals_after_commission(
    decimals: &[Decimal],
    commission_rate: Decimal,
) -> Result<Vec<Decimal>, ConversionError> {
    decimals
        .iter()
        .map(|&decimal| decimal_after_commission(decimal, commission_rate))
        .collect()
}

pub fn decimals_before_commission(
    decimals: &[Decimal],
    commission_rate: Decimal,
) -> Result<Vec<Decimal>, ConversionError> {
    decimals
        .iter()
        .map(|&decimal| decimal_before_commission(decimal, commission_rate))
        .collect()
}

pub fn normalized_probabilities(decimals: &[Decimal]) -> Result<Vec<Decimal>, ConversionError> {
    let mut implied = Vec::with_capacity(decimals.len());
    for &decimal in decimals {
        implied.push(probability_from_decimal(decimal)?);
    }
    let total: Decimal = implied.iter().copied().sum();
    if total <= Decimal::ZERO {
        return Err(ConversionError::InvalidProbabilityTotal);
    }
    Ok(implied.into_iter().map(|p| p / total).collect())
}

pub fn decimals_without_overround(decimals: &[Decimal]) -> Result<Vec<Decimal>, ConversionError> {
    let probabilities = normalized_probabilities(decimals)?;
    let mut adjusted = Vec::with_capacity(probabilities.len());
    for probability in probabilities {
        adjusted.push(decimal_from_probability(probability)?);
    }
    Ok(adjusted)
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;
    use std::str::FromStr;

    fn dec(value: &str) -> Decimal {
        Decimal::from_str(value).expect("valid decimal")
    }

    #[test]
    fn converts_probability_decimal_roundtrip() {
        let probability = dec("0.512");
        let decimal = decimal_from_probability(probability).expect("conversion");
        assert!(decimal > Decimal::ONE);
        let back = probability_from_decimal(decimal).expect("back conversion");
        assert!((back - probability).abs() < Decimal::new(1, 6));
    }

    #[test]
    fn converts_american_decimal_roundtrip() {
        let decimal = dec("2.45");
        let american = american_from_decimal(decimal).expect("american");
        assert_eq!(american, 145);
        let reconstructed = decimal_from_american(american).expect("decimal");
        assert!((reconstructed - decimal).abs() < Decimal::new(1, 2));
    }

    #[test]
    fn removes_overround() {
        let decimals = [dec("1.85"), dec("2.05")];
        let adjusted = decimals_without_overround(&decimals).expect("adjusted");
        let normalized = normalized_probabilities(&adjusted).expect("normalized");
        let total: Decimal = normalized.iter().copied().sum();
        assert!((total - Decimal::ONE).abs() < Decimal::new(1, 6));
    }

    #[test]
    fn applies_commission_to_decimal() {
        let decimal = dec("2.50");
        let rate = dec("0.05");
        let net = decimal_after_commission(decimal, rate).expect("net decimal");
        assert!((net - dec("2.425")).abs() < Decimal::new(1, 6));
    }

    proptest! {
        #[test]
        fn commission_roundtrip(raw in 1.01f64..10.0f64, commission in 0.01f64..0.15f64) {
            let decimal = Decimal::from_f64(raw).expect("decimal from f64");
            let rate = Decimal::from_f64(commission).expect("rate from f64");
            let net = decimal_after_commission(decimal, rate).expect("net decimal");
            let restored = decimal_before_commission(net, rate).expect("restored decimal");
            prop_assert!((restored - decimal).abs() < Decimal::new(1, 6));
        }
    }
}
