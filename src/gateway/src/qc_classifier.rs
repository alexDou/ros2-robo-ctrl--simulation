//! Simulated QC classification seam (Unit 7.2, hand-sim-6n92).
//!
//! One-function plugin on the spawn path only: `QcClassifier::classify`
//! assigns a tower color + soundness flag after blind-payload validation and
//! before fabric publish. The random stub stands in for a future inspection
//! service; swapping it means implementing the trait + one wiring line in the
//! `ws` spawn arm. Pick-and-place path untouched.

use std::time::{SystemTime, UNIX_EPOCH};

pub use crate::domain::GearColor;

/// Classification outcome: tower color + soundness (`false` = defective, routes to `ScrapBin`).
pub type Classification = (GearColor, bool);

/// One-function plugin seam for spawn classification.
pub trait QcClassifier {
    /// Returns the next `(color, intact)` classification.
    fn classify(&mut self) -> Classification;
}

/// Random stub: uniform `WHITE`/`GREEN`/`BLUE`, ~20% `intact == false`.
///
/// Std-only xorshift64* - no new dependency for what a few lines do.
#[derive(Debug, Clone)]
pub struct RandomQcClassifier {
    state: u64,
}

impl RandomQcClassifier {
    /// Builds a classifier from an explicit seed (deterministic per seed).
    #[must_use]
    pub const fn seeded(seed: u64) -> Self {
        Self {
            state: if seed == 0 {
                0x9E37_79B9_7F4A_7C15
            } else {
                seed
            },
        }
    }

    const fn next_u64(&mut self) -> u64 {
        let mut x = self.state;
        x ^= x >> 12;
        x ^= x << 25;
        x ^= x >> 27;
        self.state = x;
        x.wrapping_mul(0x2545_F491_4F6C_DD1D)
    }
}

impl Default for RandomQcClassifier {
    fn default() -> Self {
        #[allow(clippy::cast_possible_truncation, clippy::as_conversions)]
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_or(0x9E37_79B9_7F4A_7C15, |d| d.as_nanos() as u64);
        Self::seeded(nanos)
    }
}

impl QcClassifier for RandomQcClassifier {
    fn classify(&mut self) -> Classification {
        let color = match self.next_u64() % 3 {
            0 => GearColor::White,
            1 => GearColor::Green,
            _ => GearColor::Blue,
        };
        let intact = self.next_u64() % 100 >= 20;
        (color, intact)
    }
}

/// Seeded mock: replays a fixed sequence, wrapping around. Hermetic E2E (7.4).
#[derive(Debug, Clone)]
pub struct SeededQcClassifier {
    sequence: Vec<Classification>,
    index: usize,
}

impl SeededQcClassifier {
    /// Builds a mock replaying `sequence` in order, wrapping at the end.
    ///
    /// # Panics
    /// Panics if `sequence` is empty.
    #[must_use]
    pub fn new(sequence: Vec<Classification>) -> Self {
        assert!(!sequence.is_empty(), "seeded sequence must not be empty");
        Self { sequence, index: 0 }
    }
}

impl QcClassifier for SeededQcClassifier {
    fn classify(&mut self) -> Classification {
        let item = self.sequence[self.index % self.sequence.len()];
        self.index = self.index.wrapping_add(1);
        item
    }
}

/// Enriches a validated blind `SPAWN_OBJECT` payload with classification.
///
/// Writes `color` (`WHITE`/`GREEN`/`BLUE`) + `defective` (`!intact`) keys the
/// `SpawnObject.srv`/`EdgeBridge` downstream expects.
#[must_use]
pub fn enrich_spawn_payload(
    mut payload: serde_json::Value,
    classification: Classification,
) -> serde_json::Value {
    let (color, intact) = classification;
    if let Some(obj) = payload.as_object_mut() {
        obj.insert(
            "color".to_string(),
            serde_json::to_value(color).unwrap_or(serde_json::Value::Null),
        );
        obj.insert(
            "defective".to_string(),
            serde_json::Value::Bool(!intact),
        );
    }
    payload
}
