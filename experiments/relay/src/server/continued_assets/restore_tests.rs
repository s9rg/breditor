//! Exact-cut reconstruction across both raster generations and portable native ancestry.
use super::{TestResult, router_with_continued_assets_and_deployment_lease};
use crate::{
    ContinuedAssetStore, Error, RelaySegmentBaseFile,
    assets::{AssetStore, asset_id},
    room::segment_handover_test_source,
    server::{
        Authentication, ContinuedRasterRoomBackupFiles, ContinuedRasterRoomBackupIdentity,
        ContinuedRasterRoomClientArchives, RoomDeploymentAuthority,
    },
};
use crate::{
    RecoveryDocumentCredential, RecoveryRegistrationCredentials, RecoveryReviewCredential,
    assets::prepare_asset,
    server::{
        ContentAddressedServerAssets, RecoveredContinuedRasterRoom, ServerAssetAvailabilityMissing,
        ServerRecoveryAssetProvider,
    },
};
use breditor_collab_feasibility::{review::ReviewActorId, rich_replica::VersionAssetReference};
use serde_json::json;
use std::{
    fs::{self, File, OpenOptions},
    io::Write,
    path::Path,
    sync::Arc,
};

pub(super) fn check_combined_restore(
    parent: &Path,
    captured: &Path,
    backup: &ContinuedRasterRoomBackupIdentity,
    before: &str,
    rasters: [&[u8]; 2],
) -> TestResult {
    let target = parent.join("combined-restore");
    let mut mismatched = backup.clone();
    mismatched.source_epoch.identity.binding = "0".repeat(64);
    assert!(matches!(
        ContinuedRasterRoomBackupFiles::open(captured, &mismatched, None),
        Err(Error::Contract("continued raster room backup selection differs"))
    ));

    let files = ContinuedRasterRoomBackupFiles::open(captured, backup, None)?;
    let restored =
        files.restore(&target, "combined-next", ContinuedRasterRoomClientArchives::default())?;
    assert_eq!(restored.room().catchup("owner")?, before);
    for bytes in rasters {
        assert_eq!(restored.asset(&asset_id(bytes))?.ok_or("restored raster")?.bytes, bytes);
    }
    let pin = restored.identity().clone();
    drop(restored);
    let before_completion = fs::read(target.join(".continued-raster-room-complete.json"))?;
    assert!(
        files
            .restore(&target, "combined-next", ContinuedRasterRoomClientArchives::default())
            .is_err()
    );
    let reopened = files.reopen(&target, &pin)?;
    assert_eq!(reopened.room().catchup("owner")?, before);
    for bytes in rasters {
        assert_eq!(reopened.asset(&asset_id(bytes))?.ok_or("reopened raster")?.bytes, bytes);
    }
    drop(reopened);
    assert_eq!(fs::read(target.join(".continued-raster-room-complete.json"))?, before_completion);

    // Prepare another local owner from the same portable cut. It needs its own independent pin.
    let second = parent.join("second-combined-restore");
    let second_target =
        files.restore(&second, "combined-next", ContinuedRasterRoomClientArchives::default())?;
    assert_ne!(second_target.identity(), &pin);
    drop(second_target);
    assert!(matches!(
        files.reopen(&second, &pin),
        Err(Error::Contract("continued raster room completion differs"))
    ));

    let active = captured.join("rasters-active.archive");
    let original = parent.join("original-active.archive");
    fs::rename(&active, &original)?;
    fs::copy(captured.join("rasters-predecessor.archive"), &active)?;
    let refused = parent.join("should-not-exist");
    assert!(
        files
            .restore(&refused, "combined-refused", ContinuedRasterRoomClientArchives::default())
            .is_err()
    );
    assert!(!refused.exists());
    drop(files);
    assert!(ContinuedRasterRoomBackupFiles::open(captured, backup, None).is_err());
    fs::rename(original, &active)?;

    // Simulate a process that exited after appending only a final frame prefix.
    let wal = fs::read_dir(target.join("native"))?
        .collect::<std::io::Result<Vec<_>>>()?
        .into_iter()
        .map(|entry| entry.path())
        .find(|path| path.extension().is_some_and(|ext| ext == "wal"))
        .ok_or("restored active WAL")?;
    let mut file = OpenOptions::new().append(true).open(&wal)?;
    file.write_all(&[0, 0, 0])?;
    file.sync_all()?;
    drop(file);
    let files = ContinuedRasterRoomBackupFiles::open(captured, backup, None)?;
    assert!(files.reopen(&target, &pin).is_err());
    assert_eq!(fs::read(wal)?, [0, 0, 0]);
    Ok(())
}

#[test]
fn linked_capture_requires_its_exact_native_parent() -> TestResult {
    let (files, mut room, _) = segment_handover_test_source(3, true, true)?;
    let source = files.room();
    let directory = source.parent().ok_or("fixture parent")?;
    let wal = directory.join("parent.archive");
    let checkpoint = directory.join("parent.checkpoint");
    room.enable_review("owner")?;
    let document = room.register("owner")?;
    let review = room.register_review("owner", ReviewActorId::try_new("review")?)?;
    let credentials = RecoveryRegistrationCredentials {
        documents: vec![RecoveryDocumentCredential {
            principal: "owner".into(),
            writer: document.lease.writer.clone(),
            credential: document.credential,
        }],
        reviews: vec![RecoveryReviewCredential {
            principal: "owner".into(),
            actor: "review".into(),
            credential: review.credential,
        }],
    };
    let first = room.write_relay_segment_base(
        "owner",
        &mut File::create_new(&wal)?,
        &mut File::create_new(&checkpoint)?,
    )?;
    let parent =
        Arc::new(RelaySegmentBaseFile::open(File::open(wal)?, File::open(checkpoint)?, &first)?);
    let room = room.continue_into_relay_segment(
        "owner",
        &directory.join("linked-native"),
        parent.clone(),
        "linked-input",
    )?;
    let before = room.catchup("owner")?;
    let assets = AssetStore::open(&directory.join("seed-rasters"), room.asset_binding())?;
    let original = directory.join("seed-rasters.archive");
    let empty = assets.write_backup(&mut File::create_new(&original)?)?;
    let mut continued = ContinuedAssetStore::create_from_backup(
        &directory.join("rasters"),
        File::open(original)?,
        &empty,
    )?;
    let image = super::image(9001)?;
    let content = asset_id(&image);
    continued.put(prepare_asset(&content, "image/png", image)?)?;
    let authority =
        RoomDeploymentAuthority::create(&directory.join("authority"), &room.deployment_binding()?)?;
    let lease = authority.claim(&authority.current_selection()?)?;
    let (token, hash) = Authentication::issue_token()?;
    let (_, handle) = router_with_continued_assets_and_deployment_lease(room, Authentication::from_json(&json!({
        "format": "breditor/relay-auth", "formatVersion": 1, "origins": ["http://127.0.0.1:4187"],
        "accounts": [{"principal": "owner", "tokenHash": hash}],
    }).to_string())?, continued, lease)?;
    let captured = directory.join("capture");
    let expected = handle.capture("owner", &token, &captured)?;
    assert!(ContinuedRasterRoomBackupFiles::open(&captured, &expected, None).is_err());
    let files = ContinuedRasterRoomBackupFiles::open(&captured, &expected, Some(parent))?;
    let mut target = files.restore(
        &directory.join("restore"),
        "linked-restored",
        ContinuedRasterRoomClientArchives::default(),
    )?;
    assert_eq!(target.room().catchup("owner")?, before);
    assert_eq!(
        target.room().log_generation_descriptor("owner")?.next_sequence,
        expected.native.predecessor.source.records.to_string()
    );
    check_pending_rosters(
        &mut target,
        &handle.host.authentication,
        &token,
        &credentials,
        &content,
    )?;
    Ok(())
}

struct OpaqueMapping<'a>(&'a str);
impl ServerRecoveryAssetProvider for OpaqueMapping<'_> {
    fn check(&self) -> crate::Result<()> {
        Ok(())
    }

    fn resolve(&self, reference: &VersionAssetReference) -> crate::Result<Option<String>> {
        assert_eq!(reference.asset, "asset");
        assert_eq!(reference.generation, "generation");
        Ok(Some(self.0.to_owned()))
    }
}

fn check_pending_rosters(
    restored: &mut RecoveredContinuedRasterRoom,
    authentication: &Authentication,
    token: &str,
    credentials: &RecoveryRegistrationCredentials,
    content: &str,
) -> TestResult {
    let pending = restored.verify_recovery_inputs(
        authentication,
        "owner",
        token,
        credentials,
        &ContentAddressedServerAssets,
    )?;
    assert!(!pending.inputs_complete());
    assert!(pending.missing_registrations.is_empty());
    let writer = &credentials.documents[0].writer;
    assert_eq!(&pending.missing_upload_writers, std::slice::from_ref(writer));
    assert_eq!(&pending.client_journals.missing_document_writers, std::slice::from_ref(writer));
    assert_eq!(pending.client_journals.missing_review_actors, ["review"]);
    assert!(
        matches!(&pending.missing_assets[..], [ServerAssetAvailabilityMissing::Mapping { reference }] if reference.asset == "asset")
    );

    let mapped = restored.verify_recovery_inputs(
        authentication,
        "owner",
        token,
        credentials,
        &OpaqueMapping(content),
    )?;
    assert!(!mapped.inputs_complete());
    assert!(mapped.missing_assets.is_empty());
    assert_eq!(mapped.assets.len(), 1);
    assert_eq!(mapped.assets[0].asset, content);
    Ok(())
}
