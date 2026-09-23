//! Domain contract tests, one module per domain chunk.
//! Verbatim split of the former `domain_contract_test.rs`; no logic changed.

#[path = "domain_contract/classification.rs"]
mod classification;
#[path = "domain_contract/error.rs"]
mod error;
#[path = "domain_contract/palm.rs"]
mod palm;
#[path = "domain_contract/pick_place.rs"]
mod pick_place;
#[path = "domain_contract/robot_command.rs"]
mod robot_command;
#[path = "domain_contract/robot_telemetry.rs"]
mod robot_telemetry;
#[path = "domain_contract/safety.rs"]
mod safety;
#[path = "domain_contract/spawn.rs"]
mod spawn;
#[path = "domain_contract/telemetry_validation.rs"]
mod telemetry_validation;
#[path = "domain_contract/topics.rs"]
mod topics;
#[path = "domain_contract/trajectory.rs"]
mod trajectory;
#[path = "domain_contract/workcell.rs"]
mod workcell;
