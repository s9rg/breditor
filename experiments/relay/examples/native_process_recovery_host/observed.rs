//! Reopen independently selected A/B/C data; full-path proof remains genuine Native work.
use super::{Result, bootstrap::Bootstrap};
use breditor_collab_relay::ServerLogGenerationRoomBackup;
use std::{collections::BTreeMap, sync::Arc};
pub(super) type Observed = BTreeMap<u64, Arc<ServerLogGenerationRoomBackup>>;
pub(super) fn read(input: &Bootstrap) -> Result<Observed> {
    let mut result = BTreeMap::new();
    for row in &input.observed {
        let path = input
            .root
            .join("snapshots")
            .join(format!("cut-{}", row.sequence))
            .join("server-after.backup");
        let archive = ServerLogGenerationRoomBackup::from_owned_bytes(std::fs::read(path)?)?;
        if archive.info()?.identity != row.identity
            || result.insert(row.sequence, Arc::new(archive)).is_some()
        {
            return Err("actual observed source bytes or sequence differs".into());
        }
    }
    if !result.contains_key(&input.initial_sequence)
        || !result.contains_key(&input.previous_sequence)
    {
        return Err("original serving and predecessor cuts required".into());
    }
    Ok(result)
}
