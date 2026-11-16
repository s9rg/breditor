//! Use the actual portable relay handle from sealed activation through cold restart.
use super::{POLICY, Source, TestResult, auth, portable_activation::seed_asset_provider};
use crate::{
    Error, RecoveryRegistrationCredentials, RelayCheckpoint,
    ServerNativeHistoryBoundary as Boundary, ServerNativeHistoryFamily as Family,
    ServerNativeHistoryLane as Lane, ServerNativeHistoryReceipt,
    server::{
        RelaySegmentHandoverApproval, RelaySegmentHandoverInputCoverage, RelaySegmentPortableSeal,
        RelaySegmentRetainedBackup, RoomDeploymentAuthority, SealedRelaySegmentActivation,
    },
};
use std::{fs, sync::Arc};

#[tokio::test]
async fn relocated_relay_continues_histories_and_reclaims_wal_storage() -> TestResult {
    let source = Source::open_coordinated()?;
    let provider = seed_asset_provider(&source).await?;
    source.handle.host.transaction(|room| room.enable_review("owner")).await?;
    let original = source.handle.native_history_descriptor("owner", &source.token).await?;
    assert_eq!(original.document, Family::Original);
    assert_eq!(original.review, Some(Family::Original));
    let archive = source.parent.join("before-maintenance");
    let seal = RelaySegmentPortableSeal::select(
        source.handle.capture_fully_packed_portable_relay_segment(
            "owner",
            &source.token,
            &archive,
        )?,
    )?;
    let sealed =
        source.handle.seal_portable_relay_segment("owner", &source.token, &archive, &seal)?;
    let enable = |lane: &str| Boundary::Enable {
        root: format!("{lane}-original"),
        active: format!("{lane}-one"),
    };
    assert!(matches!(
        source
            .handle
            .apply_native_history_boundary("owner", &source.token, Lane::Document, enable("doc"))
            .await,
        Err(Error::Lease),
    ));
    assert!(matches!(
        source.handle.pack_sealed_wal("owner", &source.token, "one").await,
        Err(Error::Lease),
    ));
    let packed = source.parent.join("moved-maintenance");
    fs::rename(archive, &packed)?;
    let bundle = RelaySegmentRetainedBackup::open_portable(&packed, seal.backup())?;
    let path = source.parent.join("serving-maintenance");
    let mut target = bundle.restore(&path, "first-local", POLICY)?;
    let authentication = auth(&source.token)?;
    let RelaySegmentHandoverInputCoverage::Verified(inputs) = target.verify_handover_inputs(
        &authentication,
        "owner",
        &source.token,
        &RecoveryRegistrationCredentials::default(),
        &provider,
    )?
    else {
        return Err("relocated maintenance fixture lacks qualified inputs".into());
    };
    let approval = RelaySegmentHandoverApproval::select_verified(&target, &inputs, sealed)?;
    let (router, handle, active) = target.activate_sealed_portable_relay(
        authentication,
        "owner",
        &source.token,
        &SealedRelaySegmentActivation {
            authority: &source.authority,
            seal: &seal,
            approval: &approval,
            inputs: &inputs,
        },
    )?;
    let before = handle.storage_capacity("owner", &source.token).await?;
    assert!(matches!(
        handle
            .apply_native_history_boundary("owner", "wrong-token", Lane::Document, enable("doc"))
            .await,
        Err(Error::Permission),
    ));
    let parked = source.parent.join("parked-maintenance");
    fs::rename(&path, &parked)?;
    let displaced = handle
        .apply_native_history_boundary("owner", &source.token, Lane::Document, enable("doc"))
        .await;
    fs::rename(parked, &path)?;
    assert!(displaced.is_err());
    assert_eq!(handle.storage_capacity("owner", &source.token).await?, before);

    let document = Boundary::ContinueDocument { next: "doc-two".into() };
    let review = Boundary::ContinueReview { next: "review-two".into() };
    handle
        .apply_native_history_boundary("owner", &source.token, Lane::Document, enable("doc"))
        .await?;
    let document_receipt = handle
        .apply_native_history_boundary("owner", &source.token, Lane::Document, document.clone())
        .await?;
    let intermediate = handle.native_history_descriptor("owner", &source.token).await?;
    assert_eq!(intermediate.document, Family::ContinuedV2);
    assert_eq!(intermediate.review, Some(Family::Original));
    handle
        .apply_native_history_boundary("owner", &source.token, Lane::Review, enable("review"))
        .await?;
    let review_receipt = handle
        .apply_native_history_boundary("owner", &source.token, Lane::Review, review.clone())
        .await?;
    let after = handle.storage_capacity("owner", &source.token).await?;
    assert_eq!(
        after.log.next_sequence.parse::<u64>()?,
        before.log.next_sequence.parse::<u64>()? + 4
    );
    assert_eq!(
        after.log.rotation,
        before.log.rotation.map(|mut state| {
            state.can_rotate = true;
            state
        })
    );
    assert!(matches!(
        handle.materialize_relay_checkpoint("owner", &source.token).await,
        Err(Error::Contract("relay checkpoint requires an empty active WAL")),
    ));
    handle.rotate_log_generation("owner", &source.token, "second-local").await?;
    let rotated = handle.storage_capacity("owner", &source.token).await?;
    assert_eq!(rotated.log.next_sequence, after.log.next_sequence);
    assert_eq!(rotated.log.terminal_digest, after.log.terminal_digest);
    assert_eq!(
        rotated.log.rotation.ok_or("rotated log")?.continuation_files_remaining + 1,
        after.log.rotation.ok_or("first log")?.continuation_files_remaining
    );
    let checkpoint = handle.materialize_relay_checkpoint("owner", &source.token).await?;
    let checkpoint_identity = checkpoint.identity().clone();
    let ready = source.parent.join("checkpoint-for-reclamation");
    fs::write(&ready, checkpoint.bytes())?;
    let checkpoint = Arc::new(checkpoint);
    assert!(matches!(
        handle.pack_sealed_wal("owner", &source.token, "second-local").await,
        Err(Error::Contract("packing requires a selected sealed WAL")),
    ));
    assert!(matches!(
        handle.archive_sealed_wal("owner", &source.token, checkpoint.clone(), "second-local").await,
        Err(Error::Contract("archival requires a selected sealed WAL")),
    ));

    let before_files = source.parent.join("before-reclamation");
    let before_pack = handle.capture_fully_packed_portable_relay_segment(
        "owner",
        &source.token,
        &before_files,
    )?;
    let packing = handle.pack_sealed_wal("owner", &source.token, "first-local").await?;
    assert!(packing.packed && packing.original_bytes > packing.stored_bytes);
    let archived =
        handle.archive_sealed_wal("owner", &source.token, checkpoint, "first-local").await?;
    assert!(!archived.duplicate);
    assert_eq!(archived.stored_bytes, packing.stored_bytes);
    let archive_file = fs::read_dir(path.join("native/.sealed-wals"))?
        .next()
        .transpose()?
        .ok_or("archived WAL")?
        .path();
    assert!(fs::read(&archive_file)?.starts_with(b"BRWALGZ1"));
    assert!(!path.join("native").join(archive_file.file_name().ok_or("WAL name")?).exists());
    let after_files = source.parent.join("after-reclamation");
    let after_pack =
        handle.capture_fully_packed_portable_relay_segment("owner", &source.token, &after_files)?;
    assert_eq!(before_pack, after_pack);
    assert_eq!(
        fs::read(before_files.join("native.archive"))?,
        fs::read(after_files.join("native.archive"))?
    );
    assert_eq!(handle.storage_capacity("owner", &source.token).await?, rotated);
    let fresh_bundle = RelaySegmentRetainedBackup::open_portable(&after_files, &after_pack)?;
    let fresh_room = source.parent.join("restored-without-wal-archive");
    let fresh_restore = fresh_bundle.restore(&fresh_room, "fresh-local", POLICY)?;
    assert_eq!(
        fresh_restore.components().0.native_history_descriptor("owner")?,
        handle.native_history_descriptor("owner", &source.token).await?
    );
    assert!(!fresh_room.join("native/.sealed-wals").exists());
    drop((fresh_restore, fresh_bundle));
    drop((router, handle));

    let authority =
        RoomDeploymentAuthority::open_at_least(&source.parent.join("authority"), &active)?;
    let target = bundle.backup().reopen(&path, POLICY)?;
    let (_, resumed, selected) = target.resume_handover(
        auth(&source.token)?,
        "owner",
        &source.token,
        &authority,
        &approval,
        &active,
    )?;
    assert_ne!(selected, active);
    let descriptor = resumed.native_history_descriptor("owner", &source.token).await?;
    assert_eq!(
        (descriptor.document, descriptor.review),
        (Family::ContinuedV2, Some(Family::ContinuedV2))
    );
    for (lane, boundary, receipt) in
        [(Lane::Document, document, document_receipt), (Lane::Review, review, review_receipt)]
    {
        assert_eq!(
            resumed.apply_native_history_boundary("owner", &source.token, lane, boundary).await?,
            ServerNativeHistoryReceipt { duplicate: true, ..receipt },
        );
    }
    let checkpoint = Arc::new(RelayCheckpoint::from_bytes(fs::read(ready)?, &checkpoint_identity)?);
    assert_eq!(resumed.pack_sealed_wal("owner", &source.token, "first-local").await?, packing);
    assert_eq!(
        resumed.archive_sealed_wal("owner", &source.token, checkpoint, "first-local").await?,
        crate::ServerSealedWalArchive { duplicate: true, ..archived },
    );
    assert_eq!(resumed.storage_capacity("owner", &source.token).await?, rotated);
    assert_eq!(authority.current_selection()?, selected);
    Ok(())
}
