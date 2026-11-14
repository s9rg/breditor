//! Private test pipe for a live old relay. The owner token stays off disk and out of responses.
use super::{Result, configured_auth, deployment, read, restored_backup, storage};
use breditor_collab_relay::{
    RoomRecoveryPolicy,
    server::{Authentication, RelaySegmentHandoverApproval, ServerBackupHandle},
};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    fs::File,
    io::{BufRead, Read, Write},
    path::Path,
};

const POLICY: RoomRecoveryPolicy = RoomRecoveryPolicy::HostReacquired;

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
enum Command {
    Handover { token: String },
}

fn input() -> Result<Vec<u8>> {
    let stdin = std::io::stdin();
    let mut line = Vec::new();
    stdin.lock().take(8193).read_until(b'\n', &mut line)?;
    if line.len() > 8192 || line.last() != Some(&b'\n') {
        return Err("private relay segment command bounds".into());
    }
    Ok(line)
}

fn prepare_and_commit(parent: &Path, handle: &ServerBackupHandle, token: &str) -> Result<Value> {
    let (backup, previous) =
        handle.capture_relay_segment("owner", token, &parent.join("capture"))?;
    storage::write_new(&parent.join("restore.json"), &serde_json::to_vec(&backup)?)?;
    let target =
        restored_backup(parent)?.restore(&parent.join("restored"), "restored-one", POLICY)?;
    let approval = RelaySegmentHandoverApproval::select(&target, backup, previous)?;
    storage::write_new(&parent.join("approval.json"), &serde_json::to_vec(&approval)?)?;
    File::open(parent)?.sync_all()?;
    let (router, handle, selected) = handle.commit_relay_segment_handover(
        "owner",
        token,
        target,
        configured_auth(parent)?,
        &approval,
    )?;
    assert_eq!(selected, approval.planned_selection()?);
    drop(router);
    drop(handle);
    Ok(json!({"kind":"committed", "records":approval.backup().native.predecessor.source.records}))
}

pub(super) fn serve_control(
    parent: &Path,
    handle: ServerBackupHandle,
) -> tokio::task::JoinHandle<Result> {
    let parent = parent.to_owned();
    tokio::task::spawn_blocking(move || {
        let Command::Handover { token } = serde_json::from_slice(&input()?)?;
        let response = prepare_and_commit(&parent, &handle, &token)?;
        {
            let mut stdout = std::io::stdout().lock();
            writeln!(stdout, "{response}")?;
            stdout.flush()?;
        }
        // Keep serving the superseded old listener until the caller checks it and exits.
        let _ = std::io::stdin().lock().read(&mut [0; 1]);
        Ok(())
    })
}

pub(super) fn resumed_router(
    parent: &Path,
    authentication: Authentication,
) -> Result<axum::Router> {
    let Command::Handover { token } = serde_json::from_slice(&input()?)?;
    let authority = deployment(parent)?;
    let approval: RelaySegmentHandoverApproval =
        serde_json::from_str(&read(&parent.join("approval.json"), 32 * 1024)?)?;
    let target = restored_backup(parent)?.reopen(&parent.join("restored"), POLICY)?;
    let selected = authority.current_selection()?;
    Ok(target.resume_handover(authentication, "owner", &token, &authority, &approval, &selected)?.0)
}
