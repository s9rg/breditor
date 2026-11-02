//! Reopen actual sealed/checkpoint files and independently selected current epoch.
use super::{Result, bootstrap::Bootstrap};
use breditor_collab_relay::{
    ServerLogGenerationRoomBackup,
    server::{
        NativeGenerationActivationCheckpointStatus as Status, PreparedLogGenerationHandover,
        PreparedNativeGenerationActivation, PreparedNativeGenerationActivationIdentity,
        RoomDeploymentAuthority,
    },
};
use std::sync::Arc;
pub(super) struct Selected {
    pub identity: PreparedNativeGenerationActivationIdentity,
    pub checkpoint: Arc<PreparedNativeGenerationActivation>,
    pub authority: RoomDeploymentAuthority,
    pub status: Status,
    pub original: ServerLogGenerationRoomBackup,
}
pub(super) fn open(input: &Bootstrap) -> Result<Selected> {
    let identity: PreparedNativeGenerationActivationIdentity =
        serde_json::from_str(&input.checkpoint_json)?;
    let source = Arc::new(PreparedLogGenerationHandover::open(
        &input.root.join("source-intent"),
        identity.source(),
    )?);
    let checkpoint = Arc::new(PreparedNativeGenerationActivation::open(
        &input.root.join(&input.checkpoint_name),
        &identity,
        source.clone(),
    )?);
    let authority = RoomDeploymentAuthority::open_at_least(
        &input.root.join("authority"),
        identity.previous_selection(),
    )?;
    let status = checkpoint.status(&authority)?;
    let floor = match status {
        Status::Prepared => identity.previous_selection(),
        Status::Committed => identity.planned_selection(),
        Status::Superseded => {
            return Err("select the actual latest checkpoint independently".into());
        }
    };
    if &authority.current_selection()? != floor {
        return Err("selected checkpoint is below the current serving epoch".into());
    }
    let original =
        ServerLogGenerationRoomBackup::from_owned_bytes(source.source_backup().to_bytes()?)?;
    Ok(Selected { identity, checkpoint, authority, status, original })
}
