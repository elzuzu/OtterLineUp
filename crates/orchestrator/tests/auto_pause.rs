use orchestrator::config::ExecConfig;
use orchestrator::execution_service::{
    AutoPauseConfig, AutoPauseController, AutoPauseDecision, AutoPauseReason, AutoPauseTracker,
    MetricsWindow, RuntimeHealth,
};
use std::time::{Duration, SystemTime};

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

#[test]
fn metric_label_maps_reason_to_static_key() {
    assert_eq!(AutoPauseReason::SequencerDown.metric_label(), "sequencer_down");
    assert_eq!(AutoPauseReason::SxRpcDown.metric_label(), "sx_rpc_down");
    assert_eq!(
        AutoPauseReason::FillRatioLow { fill_ratio: 0.5, min: 0.6 }.metric_label(),
        "fill_ratio_low"
    );
    assert_eq!(
        AutoPauseReason::AcceptTimeHigh { p95_ms: 1_200, max_ms: 900 }.metric_label(),
        "accept_time_high"
    );
}

#[test]
fn error_code_maps_reason_to_standard_code() {
    assert_eq!(AutoPauseReason::SequencerDown.error_code(), "E-RUNTIME-SEQUENCER");
    assert_eq!(AutoPauseReason::SxRpcDown.error_code(), "E-RUNTIME-SX-RPC");
    assert_eq!(
        AutoPauseReason::FillRatioLow { fill_ratio: 0.5, min: 0.6 }.error_code(),
        "E-QOS-FILL-RATIO"
    );
    assert_eq!(
        AutoPauseReason::AcceptTimeHigh { p95_ms: 1_200, max_ms: 900 }.error_code(),
        "E-QOS-ACCEPT-LATENCY"
    );
}

#[test]
fn evaluate_with_timestamp_wraps_reason_and_time() {
    let controller = AutoPauseController::new(AutoPauseConfig {
        fill_ratio_min: 0.65,
        p95_accept_time_ms_max: 900,
    });
    let metrics = MetricsWindow { fill_ratio: 0.6, p95_accept_time_ms: 800 };
    let now = SystemTime::UNIX_EPOCH + Duration::from_secs(42);
    let decision = controller
        .evaluate_with_timestamp(metrics, healthy_runtime(), now)
        .expect("decision");

    assert!(matches!(
        decision,
        AutoPauseDecision {
            reason: AutoPauseReason::FillRatioLow { fill_ratio, min },
            evaluated_at,
        } if (fill_ratio - 0.6).abs() < f64::EPSILON
            && (min - 0.65).abs() < f64::EPSILON
            && evaluated_at == now
    ));
    assert_eq!(decision.metric_label(), "fill_ratio_low");
}

#[test]
fn tracker_emits_only_on_reason_change() {
    let exec_cfg = ExecConfig {
        fill_ratio_min: 0.65,
        ..ExecConfig::default()
    };
    let mut tracker = AutoPauseTracker::from_exec_config(&exec_cfg);
    let runtime = healthy_runtime();
    let low_metrics = MetricsWindow {
        fill_ratio: 0.6,
        p95_accept_time_ms: 800,
    };
    let ts1 = SystemTime::UNIX_EPOCH + Duration::from_secs(10);
    let first = tracker
        .evaluate(low_metrics, runtime, ts1)
        .expect("first pause");
    assert!(matches!(first.reason, AutoPauseReason::FillRatioLow { .. }));

    let ts2 = SystemTime::UNIX_EPOCH + Duration::from_secs(11);
    assert!(tracker.evaluate(low_metrics, runtime, ts2).is_none());

    let healthy_metrics = MetricsWindow {
        fill_ratio: 0.7,
        p95_accept_time_ms: 700,
    };
    assert!(tracker.evaluate(healthy_metrics, runtime, ts2).is_none());

    let ts3 = SystemTime::UNIX_EPOCH + Duration::from_secs(12);
    let second = tracker
        .evaluate(low_metrics, runtime, ts3)
        .expect("pause after recovery");
    assert!(matches!(second.reason, AutoPauseReason::FillRatioLow { .. }));
    assert!(second.evaluated_at >= ts3);
}

#[test]
fn tracker_is_idempotent_for_same_reason_kind() {
    let exec_cfg = ExecConfig {
        fill_ratio_min: 0.65,
        ..ExecConfig::default()
    };
    let mut tracker = AutoPauseTracker::from_exec_config(&exec_cfg);
    let runtime = healthy_runtime();

    let ts1 = SystemTime::UNIX_EPOCH + Duration::from_secs(5);
    let first = tracker
        .evaluate(
            MetricsWindow {
                fill_ratio: 0.6,
                p95_accept_time_ms: 700,
            },
            runtime,
            ts1,
        )
        .expect("first pause");
    assert!(matches!(first.reason, AutoPauseReason::FillRatioLow { .. }));

    let ts2 = SystemTime::UNIX_EPOCH + Duration::from_secs(6);
    assert!(tracker
        .evaluate(
            MetricsWindow {
                fill_ratio: 0.55,
                p95_accept_time_ms: 720,
            },
            runtime,
            ts2,
        )
        .is_none());

    let ts3 = SystemTime::UNIX_EPOCH + Duration::from_secs(7);
    let latency_pause = tracker
        .evaluate(
            MetricsWindow {
                fill_ratio: 0.7,
                p95_accept_time_ms: 1_200,
            },
            runtime,
            ts3,
        )
        .expect("latency pause");
    assert!(matches!(latency_pause.reason, AutoPauseReason::AcceptTimeHigh { .. }));
}

#[test]
fn tracker_updates_thresholds_from_exec_config() {
    let mut tracker = AutoPauseTracker::from_exec_config(&ExecConfig {
        fill_ratio_min: 0.5,
        p95_accept_time_ms_max: 900,
        ..ExecConfig::default()
    });
    tracker.update_from_exec(&ExecConfig {
        fill_ratio_min: 0.5,
        p95_accept_time_ms_max: 800,
        ..ExecConfig::default()
    });

    let runtime = healthy_runtime();
    let metrics = MetricsWindow {
        fill_ratio: 0.7,
        p95_accept_time_ms: 750,
    };
    assert!(tracker
        .evaluate(metrics, runtime, SystemTime::UNIX_EPOCH)
        .is_none());

    let slow_metrics = MetricsWindow {
        fill_ratio: 0.7,
        p95_accept_time_ms: 900,
    };
    let pause = tracker
        .evaluate(
            slow_metrics,
            runtime,
            SystemTime::UNIX_EPOCH + Duration::from_secs(1),
        )
        .expect("pause on slow accept time");
    assert!(matches!(pause.reason, AutoPauseReason::AcceptTimeHigh { .. }));
}
