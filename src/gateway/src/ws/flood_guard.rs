//! Per-session command flood ceiling (token bucket), browser -> Gateway direction only.
//!
//! Abuse protection for the boundary (ADR 0004 amendment), not a control rate: sized well above
//! any legitimate operator/sequencer traffic so that back-to-back commands are never rejected.

use std::time::Instant;

/// Sustained commands per second allowed from one session.
const COMMANDS_PER_SECOND: f64 = 50.0;
/// Commands accepted back-to-back before the sustained rate applies.
const BURST: f64 = 20.0;

pub(super) struct CommandFloodGuard {
    tokens: f64,
    last_refill: Instant,
}

impl CommandFloodGuard {
    pub(super) fn new() -> Self {
        Self {
            tokens: BURST,
            last_refill: Instant::now(),
        }
    }

    /// Takes one token; `false` means the session is flooding and the command must be rejected.
    pub(super) fn try_acquire(&mut self) -> bool {
        let now = Instant::now();
        let elapsed = now.duration_since(self.last_refill).as_secs_f64();
        self.tokens = elapsed.mul_add(COMMANDS_PER_SECOND, self.tokens).min(BURST);
        self.last_refill = now;
        if self.tokens < 1.0 {
            return false;
        }
        self.tokens -= 1.0;
        true
    }

    /// Refills the bucket (EMERGENCY_STOP bypasses the ceiling and clears any backlog).
    pub(super) fn reset(&mut self) {
        self.tokens = BURST;
        self.last_refill = Instant::now();
    }
}
