use super::{POLICY, Source, TestResult, auth};
use crate::{
    Error, RecoveryRegistrationCredentials, RelaySegmentClientUploadArchive,
    RelaySegmentClientUploadPin,
    assets::asset_id,
    server::{
        ContentAddressedServerAssets, RelaySegmentHandoverApproval,
        RelaySegmentHandoverInputCoverage, ServerRecoveryAssetProvider,
    },
};
use std::{
    fs::{self, File},
    io::Read,
    sync::Arc,
};

fn archive() -> TestResult<Vec<u8>> {
    let body = br#"{"format":"breditor/raster-asset-archive","formatVersion":1,"records":[]}"#;
    upload_archive(body, &[])
}

pub(super) fn pending_raster_archive(bytes: &[u8], width: u32) -> TestResult<Vec<u8>> {
    pending_raster_archives(&[(bytes, width)])
}

fn pending_raster_archives(rasters: &[(&[u8], u32)]) -> TestResult<Vec<u8>> {
    let mut entries: Vec<_> =
        rasters.iter().map(|&(bytes, width)| (asset_id(bytes), width, bytes)).collect();
    entries.sort_unstable_by(|left, right| left.0.cmp(&right.0));
    let mut records = Vec::new();
    let mut payload = Vec::new();
    for (asset, width, bytes) in entries {
        records.push(format!(
            concat!(
                r#"{{"asset":"{}","mime":"image/png","bytes":{},"width":{},"height":1,"status":"pending","#,
                r#""attempts":0,"storageRef":null,"failure":null,"epoch":0,"offset":{}}}"#,
            ),
            asset, bytes.len(), width, payload.len(),
        ));
        payload.extend_from_slice(bytes);
    }
    let records = records.join(",");
    let header = format!(
        r#"{{"format":"breditor/raster-asset-archive","formatVersion":1,"records":[{records}]}}"#,
    );
    upload_archive(header.as_bytes(), &payload)
}

fn upload_archive(body: &[u8], payload: &[u8]) -> TestResult<Vec<u8>> {
    let hash = asset_id(body);
    let header = format!(
        "{},\"sha256\":\"{}\"}}",
        std::str::from_utf8(&body[..body.len() - 1])?,
        &hash[7..]
    );
    let mut output = b"BREDITOR-ASSETS1\n".to_vec();
    output.extend(u32::try_from(header.len())?.to_be_bytes());
    output.extend(header.bytes());
    output.extend(payload);
    Ok(output)
}

#[tokio::test]
#[expect(
    clippy::too_many_lines,
    reason = "Keep the scenario and its assertions in chronological order"
)]
async fn incomplete_roster_and_changed_archive_custody_never_authorize_takeover() -> TestResult {
    let source = Source::open()?;
    let registrations = source
        .handle
        .host
        .transaction(|room| Ok([room.register("owner")?, room.register_observer("owner")?]))
        .await?;
    let backup = source.capture("whole")?;
    let input = source.parent.join("empty.uploads");
    let bytes = archive()?;
    fs::write(&input, &bytes)?;
    let pin = |writer: &str| RelaySegmentClientUploadPin {
        writer: writer.into(),
        bytes: bytes.len() as u64,
        sha256: asset_id(&bytes)[7..].into(),
    };
    let selected = |writer| RelaySegmentClientUploadArchive::open(File::open(&input)?, pin(writer));
    let invalid = RelaySegmentClientUploadPin { sha256: "0".repeat(64), ..pin("2") };
    assert!(RelaySegmentClientUploadArchive::open(File::open(&input)?, invalid).is_err());
    let duplicate = source.parent.join("duplicate");
    assert!(
        backup
            .restore_with_client_upload_archives(
                &duplicate,
                "new",
                POLICY,
                &[selected("2")?, selected("2")?],
            )
            .is_err()
    );
    assert!(!duplicate.exists());

    let provider: Arc<dyn ServerRecoveryAssetProvider> = Arc::new(ContentAddressedServerAssets);
    let authentication = auth(&source.token)?;
    let credentials = RecoveryRegistrationCredentials {
        documents: registrations
            .into_iter()
            .map(|registration| crate::RecoveryDocumentCredential {
                principal: "owner".into(),
                writer: registration.lease.writer,
                credential: registration.credential,
            })
            .collect(),
        ..RecoveryRegistrationCredentials::default()
    };
    let mut empty = backup.restore_with_client_upload_archives(
        &source.parent.join("partial"),
        "new",
        POLICY,
        &[selected("2")?],
    )?;
    let pending = empty.verify_handover_inputs(
        &authentication,
        "owner",
        &source.token,
        &credentials,
        &provider,
    )?;
    let RelaySegmentHandoverInputCoverage::Pending(pending) = pending else {
        return Err("omitted observer upload archive was accepted".into());
    };
    assert_eq!(pending.missing_upload_writers, ["3"]);
    assert!(pending.missing_registrations.is_empty());
    assert!(
        RelaySegmentHandoverApproval::select(
            &empty,
            backup.identity().clone(),
            source.lease.selection(),
        )
        .is_err()
    );
    drop(empty);

    let mut foreign = backup.restore_with_client_upload_archives(
        &source.parent.join("foreign"),
        "new",
        POLICY,
        &[selected("2")?, selected("4")?],
    )?;
    assert!(matches!(
        foreign.verify_handover_inputs(
            &authentication,
            "owner",
            &source.token,
            &credentials,
            &provider,
        ),
        Err(Error::Contract("client upload archive writer is not registered"))
    ));
    drop(foreign);

    let path = source.parent.join("complete");
    let target = backup.restore_with_client_upload_archives(
        &path,
        "new",
        POLICY,
        &[selected("2")?, selected("3")?],
    )?;
    let retained_path = path.join("client-uploads/3.uploads");
    let mut actual = Vec::new();
    target
        .open_client_upload_archive("3")?
        .ok_or("selected observer archive")?
        .read_to_end(&mut actual)?;
    assert_eq!(actual, bytes);
    fs::remove_file(&input)?;
    drop(target);
    let target = backup.reopen(&path, POLICY)?;
    assert_eq!(target.client_upload_pins()?, Some(vec![pin("2"), pin("3")]));
    let changed = source.parent.join("renamed-archive");
    fs::rename(&retained_path, &changed)?;
    assert!(target.client_upload_pins().is_err());
    fs::copy(&changed, &retained_path)?;
    assert!(target.open_client_upload_archive("3").is_err());
    assert!(target.client_upload_pins().is_err());
    fs::remove_file(&retained_path)?;
    drop(target);
    assert!(backup.reopen(&path, POLICY).is_err());
    assert!(!retained_path.exists());
    fs::rename(changed, retained_path)?;
    let target = backup.reopen(&path, POLICY)?;
    assert_eq!(target.client_upload_pins()?.ok_or("coverage")?.len(), 2);
    let retained_path = path.join("client-uploads/3.uploads");
    let mut altered = bytes.clone();
    *altered.last_mut().ok_or("queue bytes")? ^= 1;
    fs::write(&retained_path, altered)?;
    assert!(target.open_client_upload_archive("3").is_err());
    assert!(target.client_upload_pins().is_err());
    drop(target);
    assert!(backup.reopen(&path, POLICY).is_err());
    fs::write(&retained_path, bytes)?;
    assert_eq!(backup.reopen(&path, POLICY)?.client_upload_pins()?.ok_or("coverage")?.len(), 2);
    assert_eq!(source.authority.current_selection()?, source.lease.selection());
    Ok(())
}

#[tokio::test]
#[expect(
    clippy::too_many_lines,
    reason = "Keep the scenario and its assertions in chronological order"
)]
async fn selective_restore_gives_the_last_raster_slot_to_offline_redo() -> TestResult {
    use crate::{
        Admission, RecoveryDocumentCredential, RelaySegmentClientJournal,
        RelaySegmentClientJournalPin, RelaySegmentDocumentJournalFamily, RelaySegmentJournalOwner,
        RelaySegmentQueuedRasterRestore,
        assets::{MAX_ASSETS, prepare_asset},
        server::ServerAssetAvailabilityMissing,
    };
    use breditor_collab_feasibility::rich_replica::{
        Command, VersionAssetReference, actions::ReplaceImage,
    };
    use sha2::{Digest, Sha256};
    use std::io::Cursor;

    struct MapSeedRaster(String);
    impl ServerRecoveryAssetProvider for MapSeedRaster {
        fn check(&self) -> crate::Result<()> {
            Ok(())
        }
        fn resolve(&self, pair: &VersionAssetReference) -> crate::Result<Option<String>> {
            Ok((pair.asset == "asset" && pair.generation == "generation").then(|| self.0.clone()))
        }
    }

    let source = Source::open()?;
    let png = |width| -> TestResult<Vec<u8>> {
        let mut out = Cursor::new(Vec::new());
        image::DynamicImage::new_rgba8(width, 1).write_to(&mut out, image::ImageFormat::Png)?;
        Ok(out.into_inner())
    };
    let seed = super::retained_upload_capacity::fill_raster_store(&source, MAX_ASSETS - 1).await?;
    let (registration, frame) = source
        .handle
        .host
        .transaction(|room| Ok((room.register("owner")?, room.catchup("owner")?)))
        .await?;
    let writer = registration.lease.writer;
    let mut client = source.profile.join_frame("room".into(), writer.clone(), &frame)?;
    let redo_png = png(2)?;
    let only_redo = asset_id(&redo_png);
    let generation = "offline-redo";
    assert!(client.apply(vec![Command::ReplaceImage(ReplaceImage {
        block: "image-block".into(),
        asset: only_redo.clone(),
        generation: generation.into(),
    })])?);
    assert!(client.undo()?);
    assert!(!client.document_json().contains(&only_redo));
    let backup = source.capture("raster-required-by-redo")?;
    let input = source.parent.join("offline-redo-raster-queue");
    let unrelated_png = png(3)?;
    let unrelated = asset_id(&unrelated_png);
    let bytes = pending_raster_archives(&[(&redo_png, 2), (&unrelated_png, 3)])?;
    fs::write(&input, &bytes)?;
    let uploads = RelaySegmentClientUploadArchive::open(
        File::open(input)?,
        RelaySegmentClientUploadPin {
            writer: writer.clone(),
            bytes: bytes.len() as u64,
            sha256: asset_id(&bytes)[7..].into(),
        },
    )?;
    let journal_path = source.parent.join("client-native-journal");
    let journal = client.checkpoint()?;
    fs::write(&journal_path, &journal)?;
    let original = RelaySegmentClientJournal::open(
        File::open(journal_path)?,
        RelaySegmentClientJournalPin {
            owner: RelaySegmentJournalOwner::Document {
                writer: writer.clone(),
                family: RelaySegmentDocumentJournalFamily::Original,
            },
            bytes: journal.len() as u64,
            sha256: Sha256::digest(journal.as_bytes()).into(),
        },
    )?;
    let (uploads, originals) = ([uploads], [original]);
    let all = source.parent.join("too-many-uploads");
    assert!(matches!(
        backup.restore_with_client_journals(&all, "too-many", POLICY, &uploads, &originals),
        Err(Error::Contract("restored raster union budget"))
    ));
    assert!(!all.exists());
    let path = source.parent.join("replacement-missing-offline-raster");
    let mut replacement =
        backup.restore_retaining_client_uploads(&path, "new", POLICY, &uploads, &originals, &[])?;
    assert!(replacement.components().1.get(&only_redo)?.is_none());
    let mut retained = Vec::new();
    replacement
        .open_client_upload_archive(&writer)?
        .ok_or("offline queue")?
        .read_to_end(&mut retained)?;
    assert_eq!(retained, bytes);
    let provider: Arc<dyn ServerRecoveryAssetProvider> = Arc::new(MapSeedRaster(seed));
    let credentials = RecoveryRegistrationCredentials {
        documents: vec![RecoveryDocumentCredential {
            principal: "owner".into(),
            writer,
            credential: registration.credential,
        }],
        ..RecoveryRegistrationCredentials::default()
    };
    let authentication = auth(&source.token)?;
    let pending = replacement.verify_handover_inputs(
        &authentication,
        "owner",
        &source.token,
        &credentials,
        &provider,
    )?;
    let RelaySegmentHandoverInputCoverage::Pending(pending) = pending else {
        return Err("offline Redo referenced a missing raster and the handover was approved".into());
    };
    assert!(pending.missing_registrations.is_empty());
    assert!(pending.missing_upload_writers.is_empty());
    assert!(matches!(&pending.missing_assets[..],
        [ServerAssetAvailabilityMissing::Bytes {reference, content_asset}]
            if reference.asset == only_redo && reference.generation == generation && content_asset == &only_redo));
    let mut all_ids = [only_redo.clone(), unrelated.clone()];
    all_ids.sort_unstable();
    let restore = |path: &std::path::Path, selected: &[String]| {
        backup.restore_selecting_queued_rasters(
            path,
            "selected",
            POLICY,
            RelaySegmentQueuedRasterRestore {
                archives: &uploads,
                journals: &originals,
                queued_rasters: selected,
                ..RelaySegmentQueuedRasterRestore::default()
            },
        )
    };
    assert!(matches!(
        restore(&all, &all_ids),
        Err(Error::Contract("restored raster union budget"))
    ));
    assert!(!all.exists());
    let invalid = source.parent.join("invalid-selection");
    let mut unsorted = all_ids.clone();
    unsorted.reverse();
    for ids in [&[only_redo.clone(), only_redo.clone()][..], &unsorted] {
        assert!(matches!(
            restore(&invalid, ids),
            Err(Error::Contract("selected queued rasters must be unique and sorted"))
        ));
        assert!(!invalid.exists());
    }
    assert!(matches!(
        restore(&invalid, &[asset_id(&png(4)?)]),
        Err(Error::Contract("selected raster missing from client upload archives"))
    ));
    assert!(!invalid.exists());

    let [ServerAssetAvailabilityMissing::Bytes { content_asset, .. }] = &pending.missing_assets[..]
    else {
        return Err("expected the authenticated missing asset".into());
    };
    let path = source.parent.join("only-redo-restored");
    let target = restore(&path, std::slice::from_ref(content_asset))?;
    assert_eq!(target.components().1.count(), MAX_ASSETS);
    assert_eq!(target.components().1.get(&only_redo)?.ok_or("staged Redo raster")?.bytes, redo_png);
    assert!(target.components().1.get(&unrelated)?.is_none());
    drop(target);
    let mut target = backup.reopen(&path, POLICY)?;
    let mut reopened_queue = Vec::new();
    target
        .open_client_upload_archive(&credentials.documents[0].writer)?
        .ok_or("reopened retained queue")?
        .read_to_end(&mut reopened_queue)?;
    assert_eq!(reopened_queue, bytes);
    let RelaySegmentHandoverInputCoverage::Verified(verified) = target.verify_handover_inputs(
        &authentication,
        "owner",
        &source.token,
        &credentials,
        &provider,
    )?
    else {
        return Err("selected raster did not complete the verification".into());
    };
    assert_eq!(verified.report().client_rasters, std::slice::from_ref(&only_redo));
    let approval = RelaySegmentHandoverApproval::select_verified(
        &target,
        &verified,
        source.lease.selection(),
    )?;
    let (_, handle, _) = source.handle.commit_verified_relay_segment_handover(
        "owner",
        &source.token,
        target,
        authentication,
        &approval,
        &verified,
    )?;
    assert!(client.redo()?);
    let frames: serde_json::Value =
        serde_json::from_str(&client.writer_groups_v2_guarded(&client.observe()?, "0")?)?;
    let frames = serde_json::from_value::<Vec<String>>(frames["groups"].clone())?;
    assert!(!frames.is_empty());
    let credential = credentials.documents.into_iter().next().ok_or("protected writer")?;
    let store = handle.host.assets.clone().ok_or("target raster owner")?;
    let accepted = handle
        .host
        .transaction(move |room| {
            let lease = room.resume("owner", &credential.writer, &credential.credential)?;
            for frame in frames {
                assert!(matches!(room.admit("owner", &lease, &frame)?, Admission::Durable(_)));
            }
            let mut assets = store.lock().map_err(|_| Error::NeedsRecovery)?;
            assert_eq!(
                room.read_asset("owner", &assets, &only_redo)?.ok_or(Error::NeedsRecovery)?.bytes,
                redo_png
            );
            assert!(matches!(
                room.put_asset(
                    "owner",
                    &mut assets,
                    prepare_asset(&unrelated, "image/png", unrelated_png)?
                ),
                Err(Error::Contract("asset store budget"))
            ));
            room.catchup("owner")
        })
        .await?;
    let observer = source.profile.join_frame("room".into(), "900".into(), &accepted)?;
    assert_eq!(observer.document_json(), client.document_json());
    Ok(())
}
