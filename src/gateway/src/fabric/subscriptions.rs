//! Subscription handles with drop-guard lifecycle teardown.

use tokio::sync::broadcast;

use super::super::action::ActionFeedbackFrame;

/// Subscription handle wrapping broadcast receiver and holding a cleanup guard.
pub struct TelemetrySubscription {
    pub(super) receiver: broadcast::Receiver<String>,
    pub(super) drop_guard: Option<Box<dyn FnOnce() + Send>>,
}

impl std::fmt::Debug for TelemetrySubscription {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("TelemetrySubscription")
            .field("receiver", &self.receiver)
            .finish_non_exhaustive()
    }
}

impl std::ops::Deref for TelemetrySubscription {
    type Target = broadcast::Receiver<String>;

    fn deref(&self) -> &Self::Target {
        &self.receiver
    }
}

impl std::ops::DerefMut for TelemetrySubscription {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.receiver
    }
}

impl Drop for TelemetrySubscription {
    fn drop(&mut self) {
        if let Some(guard) = self.drop_guard.take() {
            guard();
        }
    }
}

/// Subscription handle wrapping Action feedback broadcast receiver with a cleanup guard.
pub struct ActionFeedbackSubscription {
    pub(super) receiver: broadcast::Receiver<ActionFeedbackFrame>,
    pub(super) drop_guard: Option<Box<dyn FnOnce() + Send>>,
}

impl std::fmt::Debug for ActionFeedbackSubscription {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ActionFeedbackSubscription")
            .field("receiver", &self.receiver)
            .finish_non_exhaustive()
    }
}

impl std::ops::Deref for ActionFeedbackSubscription {
    type Target = broadcast::Receiver<ActionFeedbackFrame>;

    fn deref(&self) -> &Self::Target {
        &self.receiver
    }
}

impl std::ops::DerefMut for ActionFeedbackSubscription {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.receiver
    }
}

impl Drop for ActionFeedbackSubscription {
    fn drop(&mut self) {
        if let Some(guard) = self.drop_guard.take() {
            guard();
        }
    }
}
