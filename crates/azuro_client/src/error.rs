use std::borrow::Cow;
use std::fmt;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum AzuroErrorCode {
    SimulationRequired,
    DeltaOddThreshold,
    MaxPayout,
    Stake,
    Allowance,
    Network,
    Timeout,
    InvalidResponse,
    Configuration,
    Heartbeat,
    Unknown,
}

impl AzuroErrorCode {
    pub const fn as_str(self) -> &'static str {
        match self {
            AzuroErrorCode::SimulationRequired => "E-AZU-SIM-REQUIRED",
            AzuroErrorCode::DeltaOddThreshold => "E-AZU-ΔODD-THRESH",
            AzuroErrorCode::MaxPayout => "E-AZU-MAX-PAYOUT",
            AzuroErrorCode::Stake => "E-AZU-STAKE",
            AzuroErrorCode::Allowance => "E-AZU-ALLOWANCE",
            AzuroErrorCode::Network => "E-AZU-NETWORK",
            AzuroErrorCode::Timeout => "E-AZU-TIMEOUT",
            AzuroErrorCode::InvalidResponse => "E-AZU-INVALID-RESPONSE",
            AzuroErrorCode::Configuration => "E-AZU-CONFIG",
            AzuroErrorCode::Heartbeat => "E-AZU-HEARTBEAT",
            AzuroErrorCode::Unknown => "E-AZU-UNKNOWN",
        }
    }
}

impl fmt::Display for AzuroErrorCode {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AzuroError {
    code: AzuroErrorCode,
    message: Cow<'static, str>,
    detail: Option<String>,
}

impl AzuroError {
    pub fn new(code: AzuroErrorCode, message: impl Into<Cow<'static, str>>) -> Self {
        Self {
            code,
            message: message.into(),
            detail: None,
        }
    }

    pub fn with_detail(mut self, detail: impl Into<String>) -> Self {
        self.detail = Some(detail.into());
        self
    }

    pub const fn code(&self) -> AzuroErrorCode {
        self.code
    }

    pub fn message(&self) -> &str {
        self.message.as_ref()
    }

    pub fn detail(&self) -> Option<&str> {
        self.detail.as_deref()
    }

    pub fn code_str(&self) -> &'static str {
        self.code.as_str()
    }
}

impl fmt::Display for AzuroError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match &self.detail {
            Some(detail) => write!(f, "{}: {} ({detail})", self.code, self.message),
            None => write!(f, "{}: {}", self.code, self.message),
        }
    }
}

impl std::error::Error for AzuroError {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formats_error_without_detail() {
        let err = AzuroError::new(
            AzuroErrorCode::SimulationRequired,
            "simulateQuote must be executed before placeBet",
        );
        assert_eq!(err.code_str(), "E-AZU-SIM-REQUIRED");
        assert_eq!(
            format!("{err}"),
            "E-AZU-SIM-REQUIRED: simulateQuote must be executed before placeBet"
        );
        assert!(err.detail().is_none());
    }

    #[test]
    fn includes_detail_when_present() {
        let err = AzuroError::new(AzuroErrorCode::DeltaOddThreshold, "Δcote au-delà du seuil")
            .with_detail("delta=0.031, threshold=0.02");
        assert_eq!(err.code(), AzuroErrorCode::DeltaOddThreshold);
        assert_eq!(
            format!("{err}"),
            "E-AZU-ΔODD-THRESH: Δcote au-delà du seuil (delta=0.031, threshold=0.02)"
        );
        assert_eq!(err.detail(), Some("delta=0.031, threshold=0.02"));
    }
}
