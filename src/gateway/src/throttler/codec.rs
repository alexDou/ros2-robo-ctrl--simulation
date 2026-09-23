//! Wire codecs: JSON + OMG-CDR `sensor_msgs/msg/JointState` ingestion structs.

use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub(super) struct RawStampMsg {
    pub(super) sec: i64,
    pub(super) nanosec: u32,
}

#[derive(Debug, Deserialize)]
pub(super) struct RawHeaderMsg {
    #[serde(default)]
    pub(super) stamp: Option<RawStampMsg>,
}

#[derive(Debug, Deserialize)]
pub(super) struct RawJointStateMsgRef<'a> {
    #[serde(borrow)]
    pub(super) name: Vec<&'a str>,
    pub(super) position: Vec<f64>,
    #[serde(default)]
    pub(super) header: Option<RawHeaderMsg>,
    #[serde(default)]
    pub(super) timestamp_ns: Option<u64>,
}

#[derive(Debug, Deserialize)]
pub(super) struct CdrTimeMsg {
    pub(super) sec: i32,
    pub(super) nanosec: u32,
}

#[derive(Debug, Deserialize)]
pub(super) struct CdrHeaderMsg {
    pub(super) stamp: CdrTimeMsg,
    #[allow(dead_code)]
    pub(super) frame_id: String,
}

#[derive(Debug, Deserialize)]
pub(super) struct CdrJointStateMsg {
    pub(super) header: CdrHeaderMsg,
    pub(super) name: Vec<String>,
    pub(super) position: Vec<f64>,
}
