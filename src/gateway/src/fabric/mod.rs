//! DataFabric port: Memory + Zenoh adapters behind one facade.

pub(super) mod error;
pub(super) mod memory;
pub(super) mod port;
pub(super) mod subscriptions;
pub(super) mod zenoh;

pub use error::FabricError;
pub use memory::MemoryFabric;
pub use port::DataFabricPort;
pub use subscriptions::{ActionFeedbackSubscription, TelemetrySubscription};
pub use zenoh::ZenohFabric;
