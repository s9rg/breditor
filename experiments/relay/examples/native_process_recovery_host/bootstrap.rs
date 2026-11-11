//! Bounded private operator bootstrap. Raw native identities never pass through JS numbers.
use super::Result;
use breditor_collab_relay::ServerLogGenerationRoomBackupIdentity;
use serde::Deserialize;
use std::{net::SocketAddr, path::PathBuf};
#[path = "input.rs"]
mod input;
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Observed {
    pub sequence: u64,
    pub identity: ServerLogGenerationRoomBackupIdentity,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Bootstrap {
    format: String,
    format_version: u32,
    pub root: PathBuf,
    pub checkpoint_name: String,
    pub checkpoint_json: String,
    pub checkpoint_sha256: String,
    pub initial_sequence: u64,
    pub next_sequence: u64,
    pub previous_sequence: u64,
    pub observed: Vec<Observed>,
    pub protected: input::Protected,
    pub old_alice_token: String,
    pub client_address: SocketAddr,
    pub retired_address: SocketAddr,
}
#[allow(dead_code, reason = "shared with the separately compiled joint fixture")]
pub(super) fn read() -> Result<Bootstrap> {
    read_selected("breditor/private-native-process-recovery", false)
}
/// Separate joint-publication bootstrap. Repeated reopen may select the child
/// checkpoint created by a committed restart; legacy bootstrap meanings stay exact.
#[allow(dead_code, reason = "shared with the separately compiled legacy fixture")]
pub(super) fn read_joint() -> Result<Bootstrap> {
    read_selected("breditor/private-native-joint-process-recovery", true)
}
fn read_selected(format: &str, allow_process_checkpoint: bool) -> Result<Bootstrap> {
    let value: Bootstrap = input::read()?;
    if value.format != format
        || value.format_version != 1
        || value.observed.is_empty()
        || value.observed.len() > 128
        || value.next_sequence > 9_007_199_254_740_991
        || value.next_sequence <= value.previous_sequence
        || value.observed.iter().any(|row| row.sequence >= value.next_sequence)
        || !value.client_address.ip().is_loopback()
        || !value.retired_address.ip().is_loopback()
        || value.client_address.port() == 0
        || value.retired_address.port() == 0
    {
        return Err("private recovery bootstrap selection".into());
    }
    let n = value
        .checkpoint_name
        .strip_prefix("native-checkpoint-restart-")
        .or_else(|| {
            allow_process_checkpoint
                .then(|| value.checkpoint_name.strip_prefix("process-native-checkpoint-"))
                .flatten()
        })
        .ok_or("selected checkpoint namespace")?;
    if n.is_empty()
        || !n.bytes().all(|b| b.is_ascii_digit())
        || n.starts_with('0')
        || value.root.canonicalize()? != value.root
        || !std::fs::symlink_metadata(&value.root)?.is_dir()
    {
        return Err("actual recovery directory and checkpoint required".into());
    }
    if breditor_collab_relay::assets::asset_id(value.checkpoint_json.as_bytes())
        != value.checkpoint_sha256
    {
        return Err("independent raw checkpoint digest differs".into());
    }
    Ok(value)
}
