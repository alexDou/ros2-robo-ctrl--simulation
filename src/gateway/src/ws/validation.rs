//! WS command payload validation (schema + finite-float guards).

pub(super) fn validate_command_payload(cmd: &crate::domain::RobotCommand) -> Result<(), String> {
    use crate::domain::{
        ClearWorkspacePayload, CommandType, EmergencyStopPayload, PalmActuatePayload,
        PickAndPlaceTargetPayload, ResetFaultPayload, SpawnObjectPayload, TrajectoryExecutePayload,
    };
    use serde::Deserialize;
    match cmd.r#type {
        CommandType::PalmActuate => PalmActuatePayload::deserialize(&cmd.payload)
            .map(|_| ())
            .map_err(|e| e.to_string()),
        CommandType::TrajectoryExecute => TrajectoryExecutePayload::deserialize(&cmd.payload)
            .map(|_| ())
            .map_err(|e| e.to_string()),
        CommandType::EmergencyStop => EmergencyStopPayload::deserialize(&cmd.payload)
            .map(|_| ())
            .map_err(|e| e.to_string()),
        CommandType::ResetFault => ResetFaultPayload::deserialize(&cmd.payload)
            .map(|_| ())
            .map_err(|e| e.to_string()),
        CommandType::SpawnObject => {
            let payload =
                SpawnObjectPayload::deserialize(&cmd.payload).map_err(|e| e.to_string())?;
            if !payload.x.is_finite() || !payload.y.is_finite() || !payload.z.is_finite() {
                return Err("Coordinates x, y, and z must be finite floats".to_string());
            }
            Ok(())
        }
        CommandType::ClearWorkspace => ClearWorkspacePayload::deserialize(&cmd.payload)
            .map(|_| ())
            .map_err(|e| e.to_string()),
        CommandType::PickAndPlaceTarget => {
            let payload =
                PickAndPlaceTargetPayload::deserialize(&cmd.payload).map_err(|e| e.to_string())?;
            if !payload.pick_x.is_finite()
                || !payload.pick_y.is_finite()
                || !payload.pick_z.is_finite()
            {
                return Err("Coordinates must be finite floats".to_string());
            }
            if payload.drop_x.is_some_and(|x| !x.is_finite())
                || payload.drop_y.is_some_and(|y| !y.is_finite())
                || payload.drop_z.is_some_and(|z| !z.is_finite())
            {
                return Err("Coordinates must be finite floats".to_string());
            }
            Ok(())
        }
        CommandType::Ping | CommandType::Engage | CommandType::Standby => Ok(()),
        // No EdgeNode handler exists (edge falls through to UNSUPPORTED_COMMAND);
        // fail fast here so the frame never reaches the DataFabric.
        CommandType::TeleopJointTarget => {
            Err("TeleopJointTarget not supported by EdgeNode; use TRAJECTORY_EXECUTE".to_string())
        }
    }
}

pub(super) const MIN_COMMAND_INTERVAL: std::time::Duration = std::time::Duration::from_millis(50);
