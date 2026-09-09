use std::collections::HashSet;
use std::sync::{Arc, Mutex};
use thiserror::Error;

use crate::domain::robot_command_topic;

/// Errors arising during session acquisition and management.
#[derive(Debug, Error, PartialEq, Eq)]
pub enum SessionError {
    #[error("Active session already exists for robot '{0}'")]
    Conflict(String),
    #[error("Invalid robot identifier '{0}'")]
    InvalidRobotId(String),
}

/// Guard holding exclusive lease for an active robot WebSocket session.
/// Automatically releases session on drop.
#[derive(Debug)]
pub struct ActiveSessionGuard {
    robot_id: String,
    sessions: Arc<Mutex<HashSet<String>>>,
}

impl Drop for ActiveSessionGuard {
    fn drop(&mut self) {
        self.sessions
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .remove(&self.robot_id);
        log::info!("Released ActiveSession for robot: {}", self.robot_id);
    }
}

/// Registry tracking single-active-controller exclusivity per robot.
#[derive(Debug, Clone, Default)]
pub struct ActiveSessionRegistry {
    sessions: Arc<Mutex<HashSet<String>>>,
}

impl ActiveSessionRegistry {
    /// Attempts to acquire an exclusive session for `robot_id`.
    ///
    /// # Errors
    /// Returns [`SessionError::InvalidRobotId`] if the ID violates domain topic rules.
    /// Returns [`SessionError::Conflict`] if a controller session is already active for this robot.
    pub fn try_acquire(&self, robot_id: &str) -> Result<ActiveSessionGuard, SessionError> {
        // Enforce domain syntax validation
        if robot_command_topic(robot_id).is_err() {
            return Err(SessionError::InvalidRobotId(robot_id.to_string()));
        }

        let mut set = self
            .sessions
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);

        if set.contains(robot_id) {
            return Err(SessionError::Conflict(robot_id.to_string()));
        }

        set.insert(robot_id.to_string());
        drop(set);
        log::info!("Acquired ActiveSession for robot: {robot_id}");

        Ok(ActiveSessionGuard {
            robot_id: robot_id.to_string(),
            sessions: Arc::clone(&self.sessions),
        })
    }

    /// Checks if a session is currently active for the given robot ID.
    pub fn is_active(&self, robot_id: &str) -> bool {
        let set = self
            .sessions
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        set.contains(robot_id)
    }
}
