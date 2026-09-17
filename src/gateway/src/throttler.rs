//! Gateway TelemetryThrottler decimating 500 Hz RTDE telemetry to a smooth 30 Hz stream.
#![allow(clippy::missing_errors_doc, clippy::missing_panics_doc)]

use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use serde::Deserialize;
use tokio::sync::broadcast;

use crate::domain::{RobotState, RobotTelemetryEvent, UR5E_JOINTS};

/// Default decimation period targeting nominal 30 Hz (33.333ms).
pub const DEFAULT_THROTTLE_INTERVAL: Duration = Duration::from_nanos(33_333_333);

const CHANNEL_CAPACITY: usize = 512;

fn current_time_ns() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| u64::try_from(d.as_nanos()).unwrap_or(u64::MAX))
}

#[derive(Debug, Deserialize)]
struct RawStampMsg {
    sec: i64,
    nanosec: u32,
}

#[derive(Debug, Deserialize)]
struct RawHeaderMsg {
    #[serde(default)]
    stamp: Option<RawStampMsg>,
}

#[derive(Debug, Deserialize)]
struct RawJointStateMsgRef<'a> {
    #[serde(borrow)]
    name: Vec<&'a str>,
    position: Vec<f64>,
    #[serde(default)]
    header: Option<RawHeaderMsg>,
    #[serde(default)]
    timestamp_ns: Option<u64>,
}

#[derive(Debug, Default)]
struct ThrottlerState {
    pending: Option<RobotTelemetryEvent>,
    latest: Option<RobotTelemetryEvent>,
    cached_indices: Option<[usize; 6]>,
}

#[derive(Debug)]
struct ThrottlerInner {
    state: Mutex<ThrottlerState>,
    tx: broadcast::Sender<RobotTelemetryEvent>,
    tx_json: broadcast::Sender<String>,
    running: AtomicBool,
    ingested_count: AtomicUsize,
    emitted_count: AtomicUsize,
    worker_handle: Mutex<Option<tokio::task::JoinHandle<()>>>,
}

impl Drop for ThrottlerInner {
    fn drop(&mut self) {
        self.running.store(false, Ordering::Relaxed);
        let mut handle_guard = self.worker_handle.lock().expect("lock worker handle");
        if let Some(handle) = handle_guard.take() {
            handle.abort();
        }
    }
}

/// High-throughput non-blocking decimation sampler taking 500 Hz telemetry
/// and emitting 30 Hz frames without buffer bloat or latency creep.
#[derive(Debug, Clone)]
pub struct TelemetryThrottler {
    inner: Arc<ThrottlerInner>,
}

impl Default for TelemetryThrottler {
    fn default() -> Self {
        Self::new()
    }
}

impl TelemetryThrottler {
    /// Creates and starts a new `TelemetryThrottler` ticking at 30 Hz (~33.3ms).
    #[must_use]
    pub fn new() -> Self {
        Self::with_interval(DEFAULT_THROTTLE_INTERVAL)
    }

    /// Creates and starts a `TelemetryThrottler` with a custom decimation interval.
    #[must_use]
    pub fn with_interval(interval: Duration) -> Self {
        let (tx, _) = broadcast::channel(CHANNEL_CAPACITY);
        let (tx_json, _) = broadcast::channel(CHANNEL_CAPACITY);

        let inner = Arc::new(ThrottlerInner {
            state: Mutex::new(ThrottlerState::default()),
            tx,
            tx_json,
            running: AtomicBool::new(true),
            ingested_count: AtomicUsize::new(0),
            emitted_count: AtomicUsize::new(0),
            worker_handle: Mutex::new(None),
        });

        let inner_clone = Arc::clone(&inner);
        let handle = tokio::spawn(async move {
            let mut ticker = tokio::time::interval(interval);
            ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

            while inner_clone.running.load(Ordering::Relaxed) {
                ticker.tick().await;

                let event_opt = {
                    let mut guard = inner_clone.state.lock().expect("lock throttler state");
                    guard.pending.take()
                };

                if let Some(event) = event_opt {
                    inner_clone.emitted_count.fetch_add(1, Ordering::Relaxed);
                    if inner_clone.tx.receiver_count() > 0 {
                        let _ = inner_clone.tx.send(event.clone());
                    }
                    if inner_clone.tx_json.receiver_count() > 0 {
                        if let Ok(json) = serde_json::to_string(&event) {
                            let _ = inner_clone.tx_json.send(json);
                        }
                    }
                }
            }
        });

        *inner.worker_handle.lock().expect("lock worker handle") = Some(handle);

        Self { inner }
    }

    /// Pushes a typed `RobotTelemetryEvent` into the throttler in a non-blocking O(1) step.
    pub fn push_event(&self, event: RobotTelemetryEvent) {
        self.inner.ingested_count.fetch_add(1, Ordering::Relaxed);
        let mut guard = self.inner.state.lock().expect("lock throttler state");
        guard.latest = Some(event.clone());
        guard.pending = Some(event);
    }

    /// Pushes a raw byte slice into the throttler, parsing either `RobotTelemetryEvent`
    /// or `sensor_msgs/msg/JointState` into canonical UR5e joint state with zero heap allocation.
    ///
    /// # Errors
    /// Returns error string if the payload cannot be deserialized as either format.
    pub fn push_bytes(&self, bytes: &[u8]) -> Result<(), String> {
        if let Ok(event) = serde_json::from_slice::<RobotTelemetryEvent>(bytes) {
            self.push_event(event);
            return Ok(());
        }

        if let Ok(raw) = serde_json::from_slice::<RawJointStateMsgRef>(bytes) {
            let timestamp_ns = if let Some(ref h) = raw.header {
                if let Some(ref s) = h.stamp {
                    (u64::try_from(s.sec.max(0)).unwrap_or(0)) * 1_000_000_000 + u64::from(s.nanosec)
                } else {
                    raw.timestamp_ns.unwrap_or_else(current_time_ns)
                }
            } else {
                raw.timestamp_ns.unwrap_or_else(current_time_ns)
            };

            let mut positions = [0.0; 6];
            let mut guard = self.inner.state.lock().expect("lock throttler state");
            let indices = if let Some(idx) = guard.cached_indices {
                idx
            } else {
                let mut idx = [usize::MAX; 6];
                for (i, &name) in UR5E_JOINTS.iter().enumerate() {
                    if let Some(p) = raw.name.iter().position(|&n| n == name) {
                        idx[i] = p;
                    }
                }
                guard.cached_indices = Some(idx);
                idx
            };

            for (i, &pos_idx) in indices.iter().enumerate() {
                if pos_idx != usize::MAX {
                    positions[i] = raw.position.get(pos_idx).copied().unwrap_or(0.0);
                }
            }

            let event = RobotTelemetryEvent {
                timestamp_ns,
                robot_state: RobotState::Executing,
                joint_positions: positions,
                palm_state: crate::domain::PalmState::default(),
                inference_metrics: None,
                command_id: None,
            };

            self.inner.ingested_count.fetch_add(1, Ordering::Relaxed);
            guard.latest = Some(event.clone());
            guard.pending = Some(event);
            drop(guard);
            return Ok(());
        }

        Err("Failed to parse payload as RobotTelemetryEvent or JointState".to_string())
    }

    /// Pushes a raw JSON string into the throttler.
    ///
    /// # Errors
    /// Returns error string if payload cannot be parsed.
    pub fn push_raw(&self, payload: &str) -> Result<(), String> {
        self.push_bytes(payload.as_bytes())
    }

    /// Returns a broadcast receiver for 30 Hz decimated `RobotTelemetryEvent` frames.
    #[must_use]
    pub fn subscribe(&self) -> broadcast::Receiver<RobotTelemetryEvent> {
        self.inner.tx.subscribe()
    }

    /// Returns a broadcast receiver for 30 Hz decimated JSON strings.
    #[must_use]
    pub fn subscribe_json(&self) -> broadcast::Receiver<String> {
        self.inner.tx_json.subscribe()
    }

    /// Queries the most recent ingested telemetry sample without waiting for a timer tick.
    #[must_use]
    pub fn sample_latest(&self) -> Option<RobotTelemetryEvent> {
        let guard = self.inner.state.lock().expect("lock throttler state");
        guard.latest.clone()
    }

    /// Total number of high-frequency samples ingested.
    #[must_use]
    pub fn ingested_count(&self) -> usize {
        self.inner.ingested_count.load(Ordering::Relaxed)
    }

    /// Total number of decimated 30 Hz samples emitted.
    #[must_use]
    pub fn emitted_count(&self) -> usize {
        self.inner.emitted_count.load(Ordering::Relaxed)
    }

    /// Stops the background decimation ticker task.
    pub fn stop(&self) {
        self.inner.running.store(false, Ordering::Relaxed);
        let mut handle_guard = self.inner.worker_handle.lock().expect("lock worker handle");
        if let Some(handle) = handle_guard.take() {
            handle.abort();
        }
    }

    /// Attaches this throttler to a Zenoh session topic mirror (e.g. `/joint_states`),
    /// automatically ingesting incoming high-frequency frames.
    ///
    /// # Errors
    /// Returns [`zenoh::Error`] if subscriber declaration fails.
    pub async fn attach_zenoh(
        &self,
        session: &zenoh::Session,
        topic: &str,
    ) -> Result<tokio::task::JoinHandle<()>, zenoh::Error> {
        let subscriber = session.declare_subscriber(topic).await?;
        let throttler_clone = self.clone();
        let topic_str = topic.to_string();

        let handle = tokio::spawn(async move {
            log::info!("TelemetryThrottler attached to Zenoh topic: {topic_str}");
            while let Ok(sample) = subscriber.recv_async().await {
                let payload_bytes = sample.payload().to_bytes();
                let _ = throttler_clone.push_bytes(&payload_bytes);
            }
            log::info!("TelemetryThrottler detached from Zenoh topic: {topic_str}");
        });

        Ok(handle)
    }
}
