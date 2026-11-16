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
    let record = format!(
        concat!(
            r#"{{"asset":"{}","mime":"image/png","bytes":{},"width":{},"height":1,"status":"pending","#,
            r#""attempts":0,"storageRef":null,"failure":null,"epoch":0,"offset":0}}"#,
        ),
        asset_id(bytes),
        bytes.len(),
        width,
    );
    let header = format!(
        r#"{{"format":"breditor/raster-asset-archive","formatVersion":1,"records":[{record}]}}"#,
    );
    upload_archive(header.as_bytes(), bytes)
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
async fn retained_upload_bytes_do_not_satisfy_a_raster_needed_by_offline_redo() -> TestResult {
    use crate::{
        RecoveryDocumentCredential, RelaySegmentClientJournal, RelaySegmentClientJournalPin,
        RelaySegmentDocumentJournalFamily, RelaySegmentJournalOwner, assets::prepare_asset,
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
    let original = png(1)?;
    let seed = asset_id(&original);
    let prepared = prepare_asset(&seed, "image/png", original)?;
    let store = source.handle.host.assets.clone().ok_or("source raster owner")?;
    let (registration, frame) = source
        .handle
        .host
        .transaction(move |room| {
            let mut assets = store.lock().map_err(|_| Error::NeedsRecovery)?;
            room.put_asset("owner", &mut assets, prepared)?;
            Ok((room.register("owner")?, room.catchup("owner")?))
        })
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
    let bytes = pending_raster_archive(&redo_png, 2)?;
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
    let path = source.parent.join("replacement-missing-offline-raster");
    let mut replacement = backup.restore_retaining_client_uploads(
        &path,
        "new",
        POLICY,
        &[uploads],
        &[original],
        &[],
    )?;
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
    let pending = replacement.verify_handover_inputs(
        &auth(&source.token)?,
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
    assert_eq!(source.authority.current_selection()?, source.lease.selection());
    source.lease.check()?;
    Ok(())
}
