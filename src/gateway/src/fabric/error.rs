//! DataFabric error type.

use thiserror::Error;

use super::super::domain::DomainError;

/// Errors arising during DataFabric operations.
#[derive(Debug, Error)]
pub enum FabricError {
    #[error("Domain key error: {0}")]
    Domain(#[from] DomainError),
    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
    #[error("Zenoh fabric error: {0}")]
    Zenoh(String),
    #[error("Channel error: {0}")]
    Channel(String),
}
