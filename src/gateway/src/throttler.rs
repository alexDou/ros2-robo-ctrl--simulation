//! Gateway TelemetryThrottler, 30 Hz nominal tick. SIM: 5 Hz feed (passthrough); LIVE: 500 Hz RTDE feed (decimate 500->30).
#![allow(clippy::missing_errors_doc, clippy::missing_panics_doc)]

use serde::Deserialize;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
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

#[derive(Debug, Deserialize)]
struct CdrTimeMsg {
    sec: i32,
    nanosec: u32,
}

#[derive(Debug, Deserialize)]
struct CdrHeaderMsg {
    stamp: CdrTimeMsg,
    #[allow(dead_code)]
    frame_id: String,
}

#[derive(Debug, Deserialize)]
struct CdrJointStateMsg {
    header: CdrHeaderMsg,
    name: Vec<String>,
    position: Vec<f64>,
}

#[derive(Debug)]
struct ThrottlerState {
    pending: Option<RobotTelemetryEvent>,
    latest: Option<RobotTelemetryEvent>,
    cached_indices: Option<[usize; 6]>,
    current_robot_state: RobotState,
    current_palm_state: crate::domain::PalmState,
    current_phase: Option<String>,
    current_workcell_state: crate::domain::WorkcellState,
}

impl Default for ThrottlerState {
    fn default() -> Self {
        Self {
            pending: None,
            latest: None,
            cached_indices: None,
            current_robot_state: RobotState::Idle,
            current_palm_state: crate::domain::PalmState::default(),
            current_phase: None,
            current_workcell_state: crate::domain::WorkcellState {
                spawned: Vec::new(),
                in_progress: Vec::new(),
                processed: Vec::new(),
                active_id: None,
            },
        }
    }
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

/// Non-blocking sampler, 30 Hz nominal tick.
/// SIM: 5 Hz feed (passthrough/sample-hold); LIVE: 500 Hz RTDE feed (decimate 500->30).
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

    /// Dynamically sets the manipulator lifecycle state (e.g. Idle, Executing, Fault).
    pub fn set_robot_state(&self, state: RobotState) {
        let mut guard = self.inner.state.lock().expect("lock throttler state");
        guard.current_robot_state = state;
        if let Some(ref mut latest) = guard.latest {
            latest.robot_state = state;
        }
        if let Some(ref mut pending) = guard.pending {
            pending.robot_state = state;
        } else if let Some(ref latest) = guard.latest {
            guard.pending = Some(latest.clone());
        }
    }

    /// Dynamically sets the end-effector palm actuation and grasp status.
    pub fn set_palm_state(&self, state: crate::domain::PalmState) {
        let mut guard = self.inner.state.lock().expect("lock throttler state");
        guard.current_palm_state = state.clone();
        if let Some(ref mut latest) = guard.latest {
            latest.palm_state = state.clone();
        }
        if let Some(ref mut pending) = guard.pending {
            pending.palm_state = state;
        } else if let Some(ref latest) = guard.latest {
            guard.pending = Some(latest.clone());
        }
    }

    /// Gets current robot lifecycle state.
    #[must_use]
    pub fn robot_state(&self) -> RobotState {
        let guard = self.inner.state.lock().expect("lock throttler state");
        guard.current_robot_state
    }

    /// Gets current palm grasp state.
    #[must_use]
    pub fn palm_state(&self) -> crate::domain::PalmState {
        let guard = self.inner.state.lock().expect("lock throttler state");
        guard.current_palm_state.clone()
    }

    /// Pushes a typed `RobotTelemetryEvent` into the throttler in a non-blocking O(1) step.
    pub fn push_event(&self, event: RobotTelemetryEvent) {
        self.inner.ingested_count.fetch_add(1, Ordering::Relaxed);
        let mut guard = self.inner.state.lock().expect("lock throttler state");
        guard.current_robot_state = event.robot_state;
        guard.current_palm_state = event.palm_state.clone();
        guard.current_phase = event.phase.clone();
        guard.current_workcell_state = event.workcell_state.clone();
        guard.latest = Some(event.clone());
        guard.pending = Some(event);
    }

    /// Pushes a raw byte slice into the throttler, parsing `RobotTelemetryEvent` (JSON),
    /// binary OMG-CDR `sensor_msgs/msg/JointState`, or JSON `sensor_msgs/msg/JointState`
    /// into canonical UR5e joint state. Routes directly by packet header byte without
    /// trial-and-error overhead on high-frequency streams.
    ///
    /// # Errors
    /// Returns error string if the payload cannot be deserialized as any supported format.
    pub fn push_bytes(&self, bytes: &[u8]) -> Result<(), String> {
        // Fast dispatch: OMG-CDR begins with 4-byte encapsulation header [0x00, 0x01/0x00, 0x00, 0x00]
        if bytes.len() >= 4 && bytes[0] == 0 && (bytes[1] == 1 || bytes[1] == 0) {
            if let Ok(cdr_msg) = cdr::deserialize::<CdrJointStateMsg>(bytes) {
                let timestamp_ns = if cdr_msg.header.stamp.sec > 0
                    || cdr_msg.header.stamp.nanosec > 0
                {
                    (u64::try_from(cdr_msg.header.stamp.sec.max(0)).unwrap_or(0)) * 1_000_000_000
                        + u64::from(cdr_msg.header.stamp.nanosec)
                } else {
                    current_time_ns()
                };

                let mut positions = [0.0; 6];
                let mut guard = self.inner.state.lock().expect("lock throttler state");
                let indices = if let Some(idx) = guard.cached_indices {
                    idx
                } else {
                    let mut idx = [usize::MAX; 6];
                    for (i, &name) in UR5E_JOINTS.iter().enumerate() {
                        if let Some(p) = cdr_msg.name.iter().position(|n| n == name) {
                            idx[i] = p;
                        }
                    }
                    if !idx.contains(&usize::MAX) {
                        guard.cached_indices = Some(idx);
                    }
                    idx
                };

                for (i, &pos_idx) in indices.iter().enumerate() {
                    if pos_idx != usize::MAX {
                        positions[i] = cdr_msg.position.get(pos_idx).copied().unwrap_or(0.0);
                    }
                }

                let event = RobotTelemetryEvent {
                    timestamp_ns,
                    robot_state: guard.current_robot_state,
                    joint_positions: positions,
                    palm_state: guard.current_palm_state.clone(),
                    inference_metrics: None,
                    command_id: None,
                    workcell_state: guard.current_workcell_state.clone(),
                    phase: guard.current_phase.clone(),
                };

                self.inner.ingested_count.fetch_add(1, Ordering::Relaxed);
                guard.latest = Some(event.clone());
                guard.pending = Some(event);
                drop(guard);
                return Ok(());
            }

            return Err("Failed to deserialize binary payload as CDR JointState".to_string());
        }

        // JSON dispatch path
        if let Ok(event) = serde_json::from_slice::<RobotTelemetryEvent>(bytes) {
            self.push_event(event);
            return Ok(());
        }

        if let Ok(raw) = serde_json::from_slice::<RawJointStateMsgRef>(bytes) {
            let timestamp_ns = if let Some(ref h) = raw.header {
                if let Some(ref s) = h.stamp {
                    let computed = (u64::try_from(s.sec.max(0)).unwrap_or(0)) * 1_000_000_000
                        + u64::from(s.nanosec);
                    if computed > 0 {
                        computed
                    } else {
                        current_time_ns()
                    }
                } else {
                    raw.timestamp_ns
                        .filter(|&t| t > 0)
                        .unwrap_or_else(current_time_ns)
                }
            } else {
                raw.timestamp_ns
                    .filter(|&t| t > 0)
                    .unwrap_or_else(current_time_ns)
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
                if !idx.contains(&usize::MAX) {
                    guard.cached_indices = Some(idx);
                }
                idx
            };

            for (i, &pos_idx) in indices.iter().enumerate() {
                if pos_idx != usize::MAX {
                    positions[i] = raw.position.get(pos_idx).copied().unwrap_or(0.0);
                }
            }

            let event = RobotTelemetryEvent {
                timestamp_ns,
                robot_state: guard.current_robot_state,
                joint_positions: positions,
                palm_state: guard.current_palm_state.clone(),
                inference_metrics: None,
                command_id: None,
                workcell_state: guard.current_workcell_state.clone(),
                phase: guard.current_phase.clone(),
            };

            self.inner.ingested_count.fetch_add(1, Ordering::Relaxed);
            guard.latest = Some(event.clone());
            guard.pending = Some(event);
            drop(guard);
            return Ok(());
        }

        Err(
            "Failed to parse payload as RobotTelemetryEvent, CDR JointState, or JSON JointState"
                .to_string(),
        )
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
