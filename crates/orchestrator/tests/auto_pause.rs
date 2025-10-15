use orchestrator::config::ExecConfig;
use orchestrator::execution_service::{
    AutoPauseConfig, AutoPauseController, AutoPauseReason, MetricsWindow, RuntimeHealth,
};

fn base_metrics() -> MetricsWindow {
    MetricsWindow { fill_ratio: 0.7, p95_accept_time_ms: 800 }
}

fn healthy_runtime() -> RuntimeHealth {
    RuntimeHealth { sequencer_up: true, sx_rpc_up: true }
}

#[test]
fn sequencer_down_triggers_pause() {
    let controller = AutoPauseController::new(AutoPauseConfig {
        fill_ratio_min: 0.6,
        p95_accept_time_ms_max: 1000,
    });
    let reason = controller
        .evaluate(base_metrics(), RuntimeHealth { sequencer_up: false, sx_rpc_up: true })
        .expect("pause reason");
    assert!(matches!(reason, AutoPauseReason::SequencerDown));
}

#[test]
fn fill_ratio_below_threshold_triggers_pause() {
    let controller = AutoPauseController::new(AutoPauseConfig {
        fill_ratio_min: 0.65,
        p95_accept_time_ms_max: 1000,
    });
    let reason = controller
        .evaluate(MetricsWindow { fill_ratio: 0.6, p95_accept_time_ms: 800 }, healthy_runtime())
        .expect("pause");
    assert!(matches!(reason, AutoPauseReason::FillRatioLow { fill_ratio, min } if (fill_ratio - 0.6).abs() < f64::EPSILON && (min - 0.65).abs() < f64::EPSILON));
}

#[test]
fn update_from_exec_refreshes_thresholds() {
    let mut controller = AutoPauseController::new(AutoPauseConfig {
        fill_ratio_min: 0.5,
        p95_accept_time_ms_max: 800,
    });
    controller.update_from_exec(&ExecConfig { fill_ratio_min: 0.6, p95_accept_time_ms_max: 900, ..ExecConfig::default() });
    let reason = controller
        .evaluate(MetricsWindow { fill_ratio: 0.61, p95_accept_time_ms: 950 }, healthy_runtime())
        .expect("pause on p95");
    assert!(matches!(reason, AutoPauseReason::AcceptTimeHigh { p95_ms, max_ms } if p95_ms == 950 && max_ms == 900));
}
