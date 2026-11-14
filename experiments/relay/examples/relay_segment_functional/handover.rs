//! Private test pipe for a live old relay. The owner token stays off disk and out of responses.
use super::{Result, configured_auth, deployment, read, restored_backup, storage};
use breditor_collab_relay::{
    RecoveryDocumentCredential, RecoveryRegistrationCredentials, RecoveryReviewCredential,
    RelaySegmentClientRaster, RoomRecoveryPolicy,
    assets::AssetInfo,
    server::{
        Authentication, ContentAddressedServerAssets, RelaySegmentHandoverApproval,
        RelaySegmentHandoverInputCoverage, ServerBackupHandle, ServerRecoveryAssetProvider,
    },
};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    fs::File,
    io::{BufRead, Read, Write},
    path::Path,
    sync::Arc,
};

const POLICY: RoomRecoveryPolicy = RoomRecoveryPolicy::HostReacquired;

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
enum Command {
    #[serde(rename_all = "camelCase")]
    Handover {
        token: String,
        writer: String,
        document_credential: String,
        actor: String,
        review_credential: String,
        client_raster: AssetInfo,
    },
    Resume {
        token: String,
    },
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

fn prepare_and_commit(
    parent: &Path,
    handle: &ServerBackupHandle,
    token: &str,
    credentials: &RecoveryRegistrationCredentials,
    client_raster: AssetInfo,
) -> Result<Value> {
    let (backup, previous) =
        handle.capture_relay_segment("owner", token, &parent.join("capture"))?;
    storage::write_new(&parent.join("restore.json"), &serde_json::to_vec(&backup)?)?;
    let raster = RelaySegmentClientRaster::open(
        File::open(parent.join("client-raster.png"))?,
        client_raster,
    )?;
    let mut target = restored_backup(parent)?.restore_with_client_rasters(
        &parent.join("restored"),
        "restored-one",
        POLICY,
        &[raster],
    )?;
    let authentication = configured_auth(parent)?;
    let provider: Arc<dyn ServerRecoveryAssetProvider> = Arc::new(ContentAddressedServerAssets);
    let pending = target.verify_handover_inputs(
        &authentication,
        "owner",
        token,
        &RecoveryRegistrationCredentials::default(),
        &provider,
    )?;
    let RelaySegmentHandoverInputCoverage::Pending(pending) = pending else {
        return Err("missing protected inputs were accepted".into());
    };
    assert_eq!(pending.missing_registrations.len(), 2);
    let coverage =
        target.verify_handover_inputs(&authentication, "owner", token, credentials, &provider)?;
    let RelaySegmentHandoverInputCoverage::Verified(inputs) = coverage else {
        return Err("original protected or provider inputs are incomplete".into());
    };
    let approval = RelaySegmentHandoverApproval::select_verified(&target, &inputs, previous)?;
    storage::write_new(&parent.join("approval.json"), &serde_json::to_vec(&approval)?)?;
    File::open(parent)?.sync_all()?;
    let (router, handle, selected) = handle.commit_verified_relay_segment_handover(
        "owner",
        token,
        target,
        authentication,
        &approval,
        &inputs,
    )?;
    assert_eq!(selected, approval.planned_selection()?);
    drop(router);
    drop(handle);
    Ok(json!({
        "kind":"committed", "records":approval.backup().native.predecessor.source.records,
        "registrationRefusals": pending.missing_registrations.len(),
        "providerRasters": inputs.report().assets.len(),
        "retainedPackets": inputs.report().references.sources.len(),
        "clientRasters": inputs.report().client_rasters.len(),
    }))
}

pub(super) fn serve_control(
    parent: &Path,
    handle: ServerBackupHandle,
) -> tokio::task::JoinHandle<Result> {
    let parent = parent.to_owned();
    tokio::task::spawn_blocking(move || {
        let Command::Handover {
            token,
            writer,
            document_credential,
            actor,
            review_credential,
            client_raster,
        } = serde_json::from_slice(&input()?)?
        else {
            return Err("expected private handover command".into());
        };
        let credentials = RecoveryRegistrationCredentials {
            documents: vec![RecoveryDocumentCredential {
                principal: "owner".into(),
                writer,
                credential: document_credential,
            }],
            reviews: vec![RecoveryReviewCredential {
                principal: "owner".into(),
                actor,
                credential: review_credential,
            }],
        };
        let response = prepare_and_commit(&parent, &handle, &token, &credentials, client_raster)?;
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
    let Command::Resume { token } = serde_json::from_slice(&input()?)? else {
        return Err("expected private resume command".into());
    };
    let authority = deployment(parent)?;
    let approval: RelaySegmentHandoverApproval =
        serde_json::from_str(&read(&parent.join("approval.json"), 32 * 1024)?)?;
    let target = restored_backup(parent)?.reopen(&parent.join("restored"), POLICY)?;
    let selected = authority.current_selection()?;
    Ok(target.resume_handover(authentication, "owner", &token, &authority, &approval, &selected)?.0)
}
