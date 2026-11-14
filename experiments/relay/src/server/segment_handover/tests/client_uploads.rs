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
    let hash = asset_id(body);
    let header = format!(
        "{},\"sha256\":\"{}\"}}",
        std::str::from_utf8(&body[..body.len() - 1])?,
        &hash[7..]
    );
    let mut output = b"BREDITOR-ASSETS1\n".to_vec();
    output.extend(u32::try_from(header.len())?.to_be_bytes());
    output.extend(header.bytes());
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
    drop(target);
    assert!(backup.reopen(&path, POLICY).is_err());
    assert!(!retained_path.exists());
    fs::rename(changed, retained_path)?;
    assert_eq!(backup.reopen(&path, POLICY)?.client_upload_pins()?.ok_or("coverage")?.len(), 2);
    assert_eq!(source.authority.current_selection()?, source.lease.selection());
    Ok(())
}
