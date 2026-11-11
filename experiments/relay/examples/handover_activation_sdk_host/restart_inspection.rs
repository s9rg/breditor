//! One-shot cold inspection from the checkpoint or a later known predecessor.
use super::{Result, authentication, checkpoint_name, input, read_pinned};
use breditor_collab_relay::ServerLogGenerationRoomBackup;
use breditor_collab_relay::server::{
    PreparedNativeGenerationActivationIdentity, SealedNativeRestartBootstrap,
    ServerLogGenerationRecoveryStateIdentity, inspect_sealed_native_restart,
};
use serde::Deserialize;
use serde_json::json;
use std::path::PathBuf;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Input {
    format: String,
    format_version: u32,
    root: PathBuf,
    checkpoint_name: String,
    checkpoint_digest: String,
    #[serde(default)]
    minimum: Option<MinimumCut>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct MinimumCut {
    sequence: u64,
    digest: String,
    selection: ServerLogGenerationRecoveryStateIdentity,
}

pub(crate) async fn inspect() -> Result {
    let input: Input = input::read()?;
    if input.format != "breditor/test-sealed-restart-inspection"
        || input.format_version != 1
        || input.root.canonicalize()? != input.root
        || !checkpoint_name(&input.checkpoint_name)
    {
        return Err("private sealed inspection selection".into());
    }
    let sealed = input.root.join("sdk-handover");
    let checkpoint_root = sealed.join(&input.checkpoint_name);
    let raw = read_pinned(&checkpoint_root.join("activation.json"), &input.checkpoint_digest)?;
    let expected_checkpoint: PreparedNativeGenerationActivationIdentity =
        serde_json::from_slice(&raw)?;
    let (expected_current, minimum) = if let Some(minimum) = input.minimum {
        if minimum.sequence == 0 || minimum.sequence > 9_007_199_254_740_991 {
            return Err("private sealed inspection predecessor selection".into());
        }
        let bytes = read_pinned(
            &input
                .root
                .join("snapshots")
                .join(format!("cut-{}", minimum.sequence))
                .join("server-after.backup"),
            &minimum.digest,
        )?;
        let archive = ServerLogGenerationRoomBackup::from_owned_bytes(bytes)?;
        (minimum.selection, Some(archive))
    } else {
        (expected_checkpoint.current().clone(), None)
    };
    let accounts = authentication::accounts()?;
    let observed = Box::pin(inspect_sealed_native_restart(
        SealedNativeRestartBootstrap {
            source_root: sealed.join("intent"),
            checkpoint_root,
            authority_root: input.root.join("authority"),
            operational_root: sealed.join("target"),
            expected_checkpoint,
            expected_current,
        },
        minimum,
        accounts.authentication,
        "owner",
        &accounts.owner,
    ))
    .await?;
    println!(
        "{}",
        json!({"format": input.format, "formatVersion": 1, "processId": std::process::id(), "selection": observed.identity()?})
    );
    Ok(())
}
