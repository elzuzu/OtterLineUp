use crate::config::ExecConfig;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct AutoPauseConfig {
    pub fill_ratio_min: f64,
    pub p95_accept_time_ms_max: u64,
}

impl From<&ExecConfig> for AutoPauseConfig {
    fn from(value: &ExecConfig) -> Self {
        Self {
            fill_ratio_min: value.fill_ratio_min,
            p95_accept_time_ms_max: value.p95_accept_time_ms_max,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct MetricsWindow {
    pub fill_ratio: f64,
    pub p95_accept_time_ms: u64,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct RuntimeHealth {
    pub sequencer_up: bool,
    pub sx_rpc_up: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub enum AutoPauseReason {
    SequencerDown,
    SxRpcDown,
    FillRatioLow { fill_ratio: f64, min: f64 },
    AcceptTimeHigh { p95_ms: u64, max_ms: u64 },
}

impl AutoPauseReason {
    pub fn metric_label(&self) -> &'static str {
        match self {
            AutoPauseReason::SequencerDown => "sequencer_down",
            AutoPauseReason::SxRpcDown => "sx_rpc_down",
            AutoPauseReason::FillRatioLow { .. } => "fill_ratio_low",
            AutoPauseReason::AcceptTimeHigh { .. } => "accept_time_high",
        }
    }
}

#[derive(Debug, Clone)]
pub struct AutoPauseController {
    cfg: AutoPauseConfig,
}

impl AutoPauseController {
    pub fn new(cfg: AutoPauseConfig) -> Self {
        Self { cfg }
    }

    pub fn update_from_exec(&mut self, exec: &ExecConfig) {
        self.cfg = AutoPauseConfig::from(exec);
    }

    pub fn evaluate(
        &self,
        metrics: MetricsWindow,
        runtime: RuntimeHealth,
    ) -> Option<AutoPauseReason> {
        if !runtime.sequencer_up {
            return Some(AutoPauseReason::SequencerDown);
        }
        if !runtime.sx_rpc_up {
            return Some(AutoPauseReason::SxRpcDown);
        }
        if metrics.fill_ratio < self.cfg.fill_ratio_min {
            return Some(AutoPauseReason::FillRatioLow {
                fill_ratio: metrics.fill_ratio,
                min: self.cfg.fill_ratio_min,
            });
        }
        if metrics.p95_accept_time_ms > self.cfg.p95_accept_time_ms_max {
            return Some(AutoPauseReason::AcceptTimeHigh {
                p95_ms: metrics.p95_accept_time_ms,
                max_ms: self.cfg.p95_accept_time_ms_max,
            });
        }
        None
    }
}
