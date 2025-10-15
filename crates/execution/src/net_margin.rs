use rust_decimal::Decimal;

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

impl NetMarginInputs {
    fn validate(self) -> Option<()> {
        if self.odds_sx <= Decimal::ONE || self.odds_azuro <= Decimal::ONE {
            return None;
        }
        if self.fees_sx < Decimal::ZERO
            || self.fees_azuro < Decimal::ZERO
            || self.gas_cost < Decimal::ZERO
            || self.slippage_sx < Decimal::ZERO
            || self.slippage_azuro < Decimal::ZERO
        {
            return None;
        }
        Some(())
    }
}

pub fn compute_net_margin(inputs: NetMarginInputs) -> Option<NetMarginBreakdown> {
    inputs.validate()?;

    let implied_sx = Decimal::ONE / inputs.odds_sx;
    let implied_azuro = Decimal::ONE / inputs.odds_azuro;
    let gross_margin = Decimal::ONE - implied_sx - implied_azuro;

    let fees_total = inputs.fees_sx + inputs.fees_azuro;
    let slippage_total = inputs.slippage_sx + inputs.slippage_azuro;
    let gas_total = inputs.gas_cost;

    let deductions = fees_total + slippage_total + gas_total;
    let net_margin = gross_margin - deductions;

    Some(NetMarginBreakdown {
        gross_margin,
        fees_total,
        slippage_total,
        gas_total,
        net_margin,
    })
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
        assert!(compute_net_margin(inputs).is_none());
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
        assert!(compute_net_margin(inputs).is_none());
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
}
