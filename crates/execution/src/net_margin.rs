use rust_decimal::Decimal;
use thiserror::Error;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct NetMarginBreakdown {
    pub gross_margin: Decimal,
    pub fees_total: Decimal,
    pub slippage_total: Decimal,
    pub gas_total: Decimal,
    pub net_margin: Decimal,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct NetMarginInputs {
    pub odds_sx: Decimal,
    pub odds_azuro: Decimal,
    pub fees_sx: Decimal,
    pub fees_azuro: Decimal,
    pub gas_cost: Decimal,
    pub slippage_sx: Decimal,
    pub slippage_azuro: Decimal,
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum NetMarginError {
    #[error("decimal odds must be greater than 1")]
    InvalidOdds,
    #[error("{0} must be non-negative")]
    NegativeCost(&'static str),
    #[error("net margin threshold must be within (-1, 1)")]
    InvalidThreshold,
}

impl NetMarginInputs {
    fn validate(self) -> Result<(), NetMarginError> {
        if self.odds_sx <= Decimal::ONE || self.odds_azuro <= Decimal::ONE {
            return Err(NetMarginError::InvalidOdds);
        }
        ensure_non_negative(self.fees_sx, "fees_sx")?;
        ensure_non_negative(self.fees_azuro, "fees_azuro")?;
        ensure_non_negative(self.gas_cost, "gas_cost")?;
        ensure_non_negative(self.slippage_sx, "slippage_sx")?;
        ensure_non_negative(self.slippage_azuro, "slippage_azuro")?;
        Ok(())
    }
}

fn ensure_non_negative(value: Decimal, label: &'static str) -> Result<(), NetMarginError> {
    if value < Decimal::ZERO {
        return Err(NetMarginError::NegativeCost(label));
    }
    Ok(())
}

fn validate_threshold(threshold: Decimal) -> Result<(), NetMarginError> {
    if threshold <= -Decimal::ONE || threshold >= Decimal::ONE {
        return Err(NetMarginError::InvalidThreshold);
    }
    Ok(())
}

pub fn compute_net_margin(inputs: NetMarginInputs) -> Result<NetMarginBreakdown, NetMarginError> {
    inputs.validate()?;

    let implied_sx = Decimal::ONE / inputs.odds_sx;
    let implied_azuro = Decimal::ONE / inputs.odds_azuro;
    let gross_margin = Decimal::ONE - implied_sx - implied_azuro;

    let fees_total = inputs.fees_sx + inputs.fees_azuro;
    let slippage_total = inputs.slippage_sx + inputs.slippage_azuro;
    let gas_total = inputs.gas_cost;

    let deductions = fees_total + slippage_total + gas_total;
    let net_margin = gross_margin - deductions;

    Ok(NetMarginBreakdown {
        gross_margin,
        fees_total,
        slippage_total,
        gas_total,
        net_margin,
    })
}

pub fn meets_net_margin_threshold(
    inputs: NetMarginInputs,
    threshold: Decimal,
) -> Result<(NetMarginBreakdown, bool), NetMarginError> {
    validate_threshold(threshold)?;
    let breakdown = compute_net_margin(inputs)?;
    let meets_threshold = breakdown.net_margin >= threshold;
    Ok((breakdown, meets_threshold))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::str::FromStr;

    fn dec(value: &str) -> Decimal {
        Decimal::from_str(value).expect("valid decimal")
    }

    #[test]
    fn rejects_invalid_odds() {
        let inputs = NetMarginInputs {
            odds_sx: dec("1.0"),
            odds_azuro: dec("1.5"),
            fees_sx: Decimal::ZERO,
            fees_azuro: Decimal::ZERO,
            gas_cost: Decimal::ZERO,
            slippage_sx: Decimal::ZERO,
            slippage_azuro: Decimal::ZERO,
        };
        assert_eq!(
            compute_net_margin(inputs).unwrap_err(),
            NetMarginError::InvalidOdds
        );
    }

    #[test]
    fn rejects_negative_costs() {
        let inputs = NetMarginInputs {
            odds_sx: dec("2.1"),
            odds_azuro: dec("2.2"),
            fees_sx: Decimal::NEGATIVE_ONE,
            fees_azuro: Decimal::ZERO,
            gas_cost: Decimal::ZERO,
            slippage_sx: Decimal::ZERO,
            slippage_azuro: Decimal::ZERO,
        };
        assert_eq!(
            compute_net_margin(inputs).unwrap_err(),
            NetMarginError::NegativeCost("fees_sx")
        );
    }

    #[test]
    fn computes_net_margin_breakdown() {
        let inputs = NetMarginInputs {
            odds_sx: dec("2.05"),
            odds_azuro: dec("2.15"),
            fees_sx: dec("0.0025"),
            fees_azuro: dec("0.003"),
            gas_cost: dec("0.0007"),
            slippage_sx: dec("0.0012"),
            slippage_azuro: dec("0.0009"),
        };

        let breakdown = compute_net_margin(inputs).expect("net margin");

        assert!(breakdown.gross_margin > Decimal::ZERO);
        assert_eq!(breakdown.fees_total, dec("0.0055"));
        assert_eq!(breakdown.slippage_total, dec("0.0021"));
        assert_eq!(breakdown.gas_total, dec("0.0007"));

        let expected_net = breakdown.gross_margin - dec("0.0083");
        assert!((breakdown.net_margin - expected_net).abs() < Decimal::new(1, 6));
    }

    #[test]
    fn validates_threshold_and_reports_decision() {
        let inputs = NetMarginInputs {
            odds_sx: dec("2.25"),
            odds_azuro: dec("2.40"),
            fees_sx: dec("0.0020"),
            fees_azuro: dec("0.0020"),
            gas_cost: dec("0.0012"),
            slippage_sx: dec("0.0010"),
            slippage_azuro: dec("0.0011"),
        };

        let threshold = dec("0.015");
        let (breakdown, meets) =
            meets_net_margin_threshold(inputs, threshold).expect("threshold evaluation");
        assert_eq!(breakdown.net_margin >= threshold, meets);

        let invalid_threshold = dec("1.2");
        assert_eq!(
            meets_net_margin_threshold(inputs, invalid_threshold).unwrap_err(),
            NetMarginError::InvalidThreshold
        );
    }
}
