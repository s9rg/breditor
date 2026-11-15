//! Coordinated relay handover requires verified client inputs and a retained cold epoch.
use super::{POLICY, Source, TestResult, auth, portable_activation::seed_asset_provider};
use crate::{
    Error, RecoveryDocumentCredential, RecoveryRegistrationCredentials,
    RelaySegmentRoomBackupFiles,
    server::{
        RelaySegmentHandoverApproval, RelaySegmentHandoverInputCoverage, RoomDeploymentAuthority,
        RoomDeploymentSelection,
    },
};
use std::{fs, path::Path};

#[tokio::test]
async fn verified_coordinated_handover_requires_a_retained_target_epoch_on_restart() -> TestResult {
    let source = Source::open_coordinated()?;
    let registration = source.handle.host.transaction(|room| room.register("owner")).await?;
    let provider = seed_asset_provider(&source).await?;
    let backup = source.capture("selected")?;
    let path = source.parent.join("target");
    let mut target = backup.restore(&path, "new", POLICY)?;
    let previous = source.lease.selection();
    assert!(matches!(
        RelaySegmentHandoverApproval::select(&target, backup.identity().clone(), previous.clone()),
        Err(Error::Contract("coordinated relay handover requires verified inputs"))
    ));
    let RelaySegmentHandoverInputCoverage::Pending(pending) = target.verify_handover_inputs(
        &auth(&source.token)?,
        "owner",
        &source.token,
        &RecoveryRegistrationCredentials::default(),
        &provider,
    )?
    else {
        return Err("protected registration was not checked".into());
    };
    assert_eq!(pending.missing_registrations.len(), 1);
    let selected = RecoveryRegistrationCredentials {
        documents: vec![RecoveryDocumentCredential {
            principal: "owner".into(),
            writer: registration.lease.writer,
            credential: registration.credential,
        }],
        ..RecoveryRegistrationCredentials::default()
    };
    let RelaySegmentHandoverInputCoverage::Verified(inputs) = target.verify_handover_inputs(
        &auth(&source.token)?,
        "owner",
        &source.token,
        &selected,
        &provider,
    )?
    else {
        return Err("matching protected input remained pending".into());
    };
    let approval =
        RelaySegmentHandoverApproval::select_verified(&target, &inputs, previous.clone())?;
    let mut detached = serde_json::to_value(&approval)?;
    detached["verifiedInputsSha256"] = serde_json::Value::Null;
    let omitted_inputs = serde_json::from_value(detached)?;
    let ledger = source.parent.join("authority/authority.log");
    let before = fs::read(&ledger)?;
    assert!(matches!(
        source.handle.commit_relay_segment_handover(
            "owner",
            &source.token,
            target,
            auth(&source.token)?,
            &omitted_inputs,
        ),
        Err(Error::Contract("coordinated relay handover requires verified inputs"))
    ));
    assert_eq!(fs::read(&ledger)?, before);
    let target = backup.reopen(&path, POLICY)?;
    let (router, handle, current) = source.handle.commit_verified_relay_segment_handover(
        "owner",
        &source.token,
        target,
        auth(&source.token)?,
        &approval,
        &inputs,
    )?;
    drop((router, handle));
    check_cold_restart(&source, &backup, &path, &approval, &current).await
}

async fn check_cold_restart(
    source: &Source,
    backup: &RelaySegmentRoomBackupFiles,
    path: &Path,
    approval: &RelaySegmentHandoverApproval,
    committed: &RoomDeploymentSelection,
) -> TestResult {
    let root = source.parent.join("authority");
    let ledger = root.join("authority.log");
    let before = fs::read(&ledger)?;
    for authority in [
        RoomDeploymentAuthority::open(&root, &committed.identity)?,
        RoomDeploymentAuthority::open_at_least(&root, approval.previous_selection())?,
    ] {
        let target = backup.reopen(path, POLICY)?;
        assert!(matches!(
            target.resume_handover(
                auth(&source.token)?,
                "owner",
                &source.token,
                &authority,
                approval,
                committed
            ),
            Err(Error::Contract("coordinated relay restart requires a retained epoch"))
        ));
        assert_eq!(fs::read(&ledger)?, before);
    }
    let authority = RoomDeploymentAuthority::open_at_least(&root, committed)?;
    let target = backup.reopen(path, POLICY)?;
    let (_, resumed, fresh) = target.resume_handover(
        auth(&source.token)?,
        "owner",
        &source.token,
        &authority,
        approval,
        committed,
    )?;
    assert_ne!(&fresh, committed);
    resumed.host.transaction(|room| room.catchup("owner")).await?;
    Ok(())
}
