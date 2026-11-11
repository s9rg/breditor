//! Recover the verified complete archive while leaving the original interrupted WAL in place.
use super::*;
use breditor_collab_feasibility::{
    review::{
        ReviewAccess, ReviewActorId, ReviewActorPolicy, ReviewOutcome, ReviewPrincipalId,
        actions::{CreateReviewThread, ReviewAction},
    },
    rich_replica::{ReviewAnchorTarget, selection::Selection},
};
use sha2::{Digest, Sha256};

#[test]
fn torn_active_frame_preserves_accepted_document_and_rasters_in_detached_archive() -> TestResult {
    let (files, mut room, mut assets, profile) = source(3, true, true)?;
    let original = ServerLogGenerationRoomBackup::capture(&mut room, &mut assets, "owner")?;
    drop(room);
    drop(assets);
    let identity = original.info()?.identity;
    let operating_directory = files.recovery();
    let mut live =
        ServerLogGenerationRoomRecovery::begin(&operating_directory, &original, &identity, POLICY)?
            .finish(&original)?
            .begin_operation(&original, &identity, POLICY, "owner")?;
    let inspect = |owner| {
        OperationalLogGenerationServerRoom::inspect_committed_native_tail(
            &operating_directory,
            &original,
            &identity,
            &original,
            POLICY,
            owner,
        )
    };
    assert!(matches!(inspect("owner"), Err(Error::Locked)));
    accepted_insert(live.room_mut(), &profile, true)?;
    let current_document = live.room().catchup("owner")?;
    let room = live.room_mut();
    room.enable_review("owner")?;
    let actor = ReviewActorId::try_new("tail-comments")?;
    let registered = room.register_review("owner", actor.clone())?;
    let writer = room.register("owner")?;
    let document = profile.join_frame("room".into(), writer.lease.writer, &current_document)?;
    let mut review = document.create_review_session(ReviewActorPolicy {
        actor,
        principal: ReviewPrincipalId::try_new("owner")?,
        access: ReviewAccess::Moderate,
    })?;
    let observed = document.observe()?;
    let anchor_json = document.capture_review_anchor_guarded(
        &observed,
        &ReviewAnchorTarget::Selection(Selection::Node { block: "image-block".into() }),
    )?;
    let review_observation = review.observe();
    assert!(matches!(
        document.dispatch_review_guarded(
            &observed,
            &mut review,
            &review_observation,
            ReviewAction::CreateThread(CreateReviewThread {
                anchor_json,
                body: "Acknowledged before the interrupted frame".into(),
            }),
        )?,
        ReviewOutcome::Committed(_)
    ));
    assert!(matches!(
        room.admit_review("owner", &registered.lease, &review.export_frame(0)?)?,
        crate::ReviewAdmission::Durable(_)
    ));
    let current_review = room.review_catchup("owner", None)?;
    let current_document = room.catchup("owner")?;
    let mut image = Cursor::new(Vec::new());
    DynamicImage::new_rgb8(4, 5).write_to(&mut image, ImageFormat::Png)?;
    let image = image.into_inner();
    let id = asset_id(&image);
    let (room, assets) = live.components_mut();
    room.put_asset("owner", assets, prepare_asset(&id, "image/png", image)?)?;
    let complete = ServerLogGenerationRoomBackup::capture(room, assets, "owner")?;
    let suffix = room.log.append_interrupted_grant_for_test(false)?;
    drop(live);

    let before = snapshot(&operating_directory)?;
    assert!(matches!(inspect("different-owner"), Err(Error::Permission)));
    assert!(reopen(&operating_directory, &original).is_err());
    let recovered = inspect("owner")?;
    assert_eq!(recovered.incomplete_bytes, suffix.len() as u64);
    assert_eq!(recovered.incomplete_sha256, <[u8; 32]>::from(Sha256::digest(&suffix)));
    assert_eq!(recovered.backup.to_bytes()?, complete.to_bytes()?);
    let exact_minimum = OperationalLogGenerationServerRoom::inspect_committed_native_tail(
        &operating_directory,
        &original,
        &identity,
        &complete,
        POLICY,
        "owner",
    )?;
    assert_eq!(exact_minimum.backup.to_bytes()?, recovered.backup.to_bytes()?);
    assert_eq!(snapshot(&operating_directory)?, before);

    let destination = operating_directory.with_file_name("detached-prefix-restore");
    let restored = ServerLogGenerationRoomRecovery::begin(
        &destination,
        &recovered.backup,
        &complete.info()?.identity,
        POLICY,
    )?
    .finish(&recovered.backup)?;
    assert_eq!(restored.room().catchup("owner")?, current_document);
    assert_eq!(restored.room().review_catchup("owner", None)?, current_review);
    assert!(restored.assets().get(&id)?.is_some());
    assert!(matches!(restored.room().catchup("interrupted-reader"), Err(Error::Permission)));
    assert_eq!(snapshot(&operating_directory)?, before);
    Ok(())
}

#[test]
fn inspection_refuses_missing_minimum_or_complete_corruption_without_changing_files() -> TestResult
{
    for corrupt in [false, true] {
        let (files, original, recovered) = restored()?;
        let operating_directory = files.recovery();
        let identity = original.info()?.identity;
        let mut live = recovered.begin_operation(&original, &identity, POLICY, "owner")?;
        let clean = snapshot(&operating_directory)?;
        assert!(live.room_mut().grant("owner", "known-later", Some(Role::Reader)).is_ok());
        let (room, assets) = live.components_mut();
        let minimum = ServerLogGenerationRoomBackup::capture(room, assets, "owner")?;
        let current = snapshot(&operating_directory)?;
        drop(live);
        assert!(
            OperationalLogGenerationServerRoom::inspect_committed_native_tail(
                &operating_directory,
                &original,
                &identity,
                &minimum,
                POLICY,
                "owner",
            )
            .is_err()
        );
        assert_eq!(snapshot(&operating_directory)?, current);

        let changed: Vec<_> =
            current.iter().filter(|(name, bytes)| clean.get(*name) != Some(*bytes)).collect();
        assert_eq!(changed.len(), 1);
        let (wal_name, _) = changed[0];
        if !corrupt {
            fs::write(
                operating_directory.join(wal_name),
                clean.get(wal_name).ok_or("known earlier WAL")?,
            )?;
        }
        let live = reopen(&operating_directory, &original)?;
        live.room().log.append_interrupted_grant_for_test(corrupt)?;
        drop(live);
        let before = snapshot(&operating_directory)?;
        let result = OperationalLogGenerationServerRoom::inspect_committed_native_tail(
            &operating_directory,
            &original,
            &identity,
            &minimum,
            POLICY,
            "owner",
        );
        assert!(
            matches!(result, Err(Error::Contract(message)) if
                if corrupt { message == "log record checksum" } else { message.contains("archive ancestor") }),
            "corrupt={corrupt}"
        );
        assert_eq!(snapshot(&operating_directory)?, before);
    }
    Ok(())
}
