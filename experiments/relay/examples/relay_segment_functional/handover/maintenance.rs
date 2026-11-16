//! Private stdin commands for exercising maintenance against the real serving handle.
use super::{POLICY, Result, next_input, read, storage};
use breditor_collab_relay::{
    RelayCheckpoint, RelayCheckpointIdentity, ServerNativeHistoryBoundary, ServerNativeHistoryLane,
    server::{RelaySegmentRetainedBackup, ServerBackupHandle},
};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{fs::File, io::Write, path::Path, sync::Arc};

const CHECKPOINT: &str = "wal-maintenance.checkpoint";
const SELECTION: &str = "wal-maintenance-selection.json";

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Command {
    principal: String,
    token: String,
    action: Action,
}

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
enum Action {
    Describe,
    Capacity,
    Boundary { lane: ServerNativeHistoryLane, boundary: ServerNativeHistoryBoundary },
    Rotate { next: String },
    Checkpoint,
    Pack { generation: String },
    Archive { generation: String },
    RecaptureProofs,
}

impl Command {
    async fn run(self, parent: &Path, handle: &ServerBackupHandle) -> Result<Value> {
        let Self { principal, token, action } = self;
        Ok(match action {
            Action::Describe => {
                serde_json::to_value(handle.native_history_descriptor(&principal, &token).await?)?
            }
            Action::Capacity => {
                serde_json::to_value(handle.storage_capacity(&principal, &token).await?)?
            }
            Action::Boundary { lane, boundary } => serde_json::to_value(
                handle.apply_native_history_boundary(&principal, &token, lane, boundary).await?,
            )?,
            Action::Rotate { next } => serde_json::to_value(
                handle.rotate_log_generation(&principal, &token, &next).await?,
            )?,
            Action::Checkpoint => {
                let checkpoint = handle.materialize_relay_checkpoint(&principal, &token).await?;
                storage::write_new(&parent.join(CHECKPOINT), checkpoint.bytes())?;
                storage::write_new(
                    &parent.join(SELECTION),
                    &serde_json::to_vec(checkpoint.identity())?,
                )?;
                File::open(parent)?.sync_all()?;
                serde_json::to_value(checkpoint.identity())?
            }
            Action::Pack { generation } => serde_json::to_value(
                handle.pack_sealed_wal(&principal, &token, &generation).await?,
            )?,
            Action::Archive { generation } => {
                let selection: RelayCheckpointIdentity =
                    serde_json::from_str(&read(&parent.join(SELECTION), 128 * 1024)?)?;
                let bytes = read(&parent.join(CHECKPOINT), 512 * 1024 * 1024)?.into_bytes();
                let checkpoint = Arc::new(RelayCheckpoint::from_bytes(bytes, &selection)?);
                serde_json::to_value(
                    handle.archive_sealed_wal(&principal, &token, checkpoint, &generation).await?,
                )?
            }
            Action::RecaptureProofs => {
                let path = parent.join("portable-proof-recapture");
                let selection = handle.capture_portable_relay_segment_with_extended_terminal(
                    &principal, &token, &path,
                )?;
                let backup = RelaySegmentRetainedBackup::open_portable_with_retired_history(
                    &path, &selection,
                )?;
                let target = parent.join("portable-retired-recapture-proof");
                let restored = backup.restore(&target, "recaptured-one", POLICY)?;
                let catchup = restored.components().0.catchup(&principal)?;
                drop(restored);
                let reopened = backup.backup().reopen(&target, POLICY)?;
                assert_eq!(catchup, reopened.components().0.catchup(&principal)?);
                json!({"nativePredecessors": selection.backup().native_predecessors.len()})
            }
        })
    }
}

pub(super) fn serve(parent: &Path, handle: ServerBackupHandle) -> tokio::task::JoinHandle<Result> {
    let parent = parent.to_owned();
    let runtime = tokio::runtime::Handle::current();
    tokio::task::spawn_blocking(move || {
        while let Some(line) = next_input()? {
            let command: Command = serde_json::from_slice(&line)?;
            let reply = match runtime.block_on(command.run(&parent, &handle)) {
                Ok(result) => json!({"kind":"maintenance", "result":result}),
                Err(error) => json!({"kind":"maintenance", "error":error.to_string()}),
            };
            let mut stdout = std::io::stdout().lock();
            writeln!(stdout, "{reply}")?;
            stdout.flush()?;
        }
        Ok(())
    })
}
