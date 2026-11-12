//! Cold recovery at both sides of the immutable raster publication boundary.
use super::{Setup, Source, TestResult, authentication, faults::captured_files, prepare};
use crate::{
    Error, Role,
    assets::{asset_id, prepare_asset},
    server::{
        SealedNativeRasterUploadInspection, SealedNativeRasterUploadRecoveryFiles,
        SealedNativeRestartBootstrap, SealedNativeRestartBootstrapCoverage,
        ServerLogGenerationRecoveryStateIdentity, inspect_sealed_native_raster_upload,
        inspect_sealed_native_restart, reopen_sealed_native_restart_host,
        retire_sealed_native_raster_upload,
    },
};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::{Cursor, Write},
    os::unix::fs::{MetadataExt, OpenOptionsExt},
    path::{Path, PathBuf},
};

struct Fixture {
    source: Source,
    bootstrap: SealedNativeRestartBootstrap,
    accepted: ServerLogGenerationRecoveryStateIdentity,
    asset: String,
    published: PathBuf,
    bytes: Vec<u8>,
}

impl Fixture {
    fn selected(&self) -> SealedNativeRestartBootstrap {
        SealedNativeRestartBootstrap {
            source_root: self.bootstrap.source_root.clone(),
            checkpoint_root: self.bootstrap.checkpoint_root.clone(),
            authority_root: self.bootstrap.authority_root.clone(),
            operational_root: self.bootstrap.operational_root.clone(),
            expected_checkpoint: self.bootstrap.expected_checkpoint.clone(),
            expected_current: self.bootstrap.expected_current.clone(),
        }
    }

    fn stage(&self) -> TestResult<PathBuf> {
        Ok(self.published.with_file_name(format!(".pending-{}", crate::credentials::issue()?)))
    }

    async fn inspect(&self) -> TestResult<SealedNativeRasterUploadInspection> {
        let (auth, owner, _) = authentication()?;
        Ok(inspect_sealed_native_raster_upload(self.selected(), None, auth, "owner", &owner)
            .await?)
    }

    fn retain(
        &self,
        observed: SealedNativeRasterUploadInspection,
    ) -> TestResult<(SealedNativeRestartBootstrap, SealedNativeRasterUploadRecoveryFiles)> {
        let mut selected = self.selected();
        selected.expected_current = observed.state.identity()?;
        let archive = self.source.directory.0.join("retained-room.archive");
        let evidence = self.source.directory.0.join("retained-stage.bin");
        retain(&evidence, observed.upload.evidence_bytes())?;
        retain(&archive, &observed.state.into_parts().0.to_bytes()?)?;
        Ok((
            selected,
            SealedNativeRasterUploadRecoveryFiles {
                archive,
                evidence,
                selection_sha256: observed.upload.selection_sha256,
            },
        ))
    }
}

fn retain(path: &Path, bytes: &[u8]) -> TestResult {
    let mut file = fs::OpenOptions::new().write(true).create_new(true).mode(0o600).open(path)?;
    file.write_all(bytes)?;
    file.sync_all()?;
    Ok(())
}

fn files(path: &Path) -> TestResult<Vec<(PathBuf, Vec<u8>)>> {
    let mut entries = captured_files(path)?;
    entries.sort();
    Ok(entries)
}

async fn fixture() -> TestResult<Fixture> {
    let setup = Box::pin(Setup::new((3, true), true, (true, true), true)).await?;
    let proof = setup.proof().await?;
    let checkpoint = prepare(&setup, "sealed-raster", &proof).await?;
    let expected_checkpoint = checkpoint.identity().clone();
    let active = setup
        .handle
        .activate_durable_native_service(
            "owner",
            &setup.owner,
            setup.authority.clone(),
            checkpoint.clone(),
            proof,
            expected_checkpoint.clone(),
        )
        .await?;
    let host = &active.recovery_host().host;
    let assets = host.assets.clone().ok_or("operating raster store")?;
    let mut png = Cursor::new(Vec::new());
    image::DynamicImage::new_rgb8(7, 8).write_to(&mut png, image::ImageFormat::Png)?;
    let bytes = png.into_inner();
    let asset = asset_id(&bytes);
    let prepared = prepare_asset(&asset, "image/png", bytes.clone())?;
    let receipt = host
        .transaction(move |room| {
            room.grant("owner", "accepted-before-raster-interruption", Some(Role::Reader))?;
            room.put_asset(
                "owner",
                &mut *assets.lock().map_err(|_| Error::NeedsRecovery)?,
                prepared,
            )
        })
        .await?;
    assert!(!receipt.duplicate);
    let accepted = setup.handle.capture_recovery_state("owner", &setup.owner).await?.identity()?;
    let bootstrap = SealedNativeRestartBootstrap {
        source_root: setup.intent.root().to_owned(),
        checkpoint_root: checkpoint.root().to_owned(),
        authority_root: setup.source.directory.0.join("authority"),
        operational_root: setup.source.directory.0.join("target"),
        expected_current: expected_checkpoint.current().clone(),
        expected_checkpoint,
    };
    let selection: serde_json::Value =
        serde_json::from_slice(&fs::read(bootstrap.operational_root.join(".rasters.json"))?)?;
    let published = bootstrap
        .operational_root
        .join(selection["directory"].as_str().ok_or("selected raster directory")?)
        .join(format!("{}.asset", &asset[7..]));
    drop(active);
    drop(setup.handle);
    drop(checkpoint);
    drop(setup.intent);
    Ok(Fixture { source: setup.source, bootstrap, accepted, asset, published, bytes })
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn sealed_raster_retirement_preserves_published_inode_and_exact_restart() -> TestResult {
    let fixture = Box::pin(fixture()).await?;
    let root = &fixture.bootstrap.operational_root;
    let ledger = files(&fixture.bootstrap.authority_root)?;
    let before = files(root)?;
    let original = fs::metadata(&fixture.published)?;
    let stage = fixture.stage()?;
    // The final name and the stage share the original inode until retirement.
    fs::hard_link(&fixture.published, &stage)?;
    let pending = files(root)?;
    let (auth, owner, _) = authentication()?;
    assert!(matches!(
        inspect_sealed_native_restart(fixture.selected(), None, auth, "owner", &owner).await,
        Err(Error::Contract("operational asset has pending work"))
    ));
    let observed = fixture.inspect().await?;
    assert_eq!(observed.state.identity()?, fixture.accepted);
    assert_eq!(observed.upload.published_asset.as_ref(), Some(&fixture.asset));
    assert_eq!(observed.upload.evidence_bytes(), fs::read(&fixture.published)?);
    assert_eq!(files(root)?, pending);
    let (selected, retained) = fixture.retain(observed)?;
    let retained_bytes = fs::read(&retained.evidence)?;
    let evidence = retained.evidence.clone();
    let wrong_evidence = fixture.source.directory.0.join("wrong-stage.bin");
    let mut altered = retained_bytes.clone();
    altered[0] ^= 1;
    retain(&wrong_evidence, &altered)?;
    let mut rejected = fixture.selected();
    rejected.expected_current = fixture.accepted.clone();
    let (auth, owner, _) = authentication()?;
    assert!(matches!(
        retire_sealed_native_raster_upload(
            rejected,
            SealedNativeRasterUploadRecoveryFiles {
                archive: retained.archive.clone(),
                evidence: wrong_evidence,
                selection_sha256: retained.selection_sha256,
            },
            auth,
            "owner",
            &owner,
        )
        .await,
        Err(Error::Contract("sealed raster retained evidence differs"))
    ));
    assert_eq!(files(root)?, pending);
    let (auth, owner, _) = authentication()?;
    let completed = retire_sealed_native_raster_upload(selected, retained, auth, "owner", &owner)
        .await?
        .identity()?;
    assert_eq!(completed, fixture.accepted);
    assert_eq!(fs::read(evidence)?, retained_bytes);
    assert_eq!(files(root)?, before);
    let final_metadata = fs::metadata(&fixture.published)?;
    assert_eq!(final_metadata.ino(), original.ino());
    assert_eq!(final_metadata.nlink(), 1);
    assert_eq!(files(&fixture.bootstrap.authority_root)?, ledger);
    let (auth, owner, _) = authentication()?;
    let mut selected = fixture.selected();
    selected.expected_current = completed.clone();
    let result = reopen_sealed_native_restart_host(
        selected,
        auth,
        "owner",
        &owner,
        fixture.source.protected_records(),
    )
    .await?;
    let SealedNativeRestartBootstrapCoverage::Verified(reopened) = result else {
        return Err("protected registrations missing".into());
    };
    assert_eq!(reopened.proof.identity(), completed);
    let assets = reopened.host.host.assets.clone().ok_or("reopened raster store")?;
    let prepared = prepare_asset(&fixture.asset, "image/png", fixture.bytes)?;
    let receipt = reopened
        .host
        .host
        .transaction(move |room| {
            room.catchup("accepted-before-raster-interruption")?;
            room.put_asset(
                "owner",
                &mut *assets.lock().map_err(|_| Error::NeedsRecovery)?,
                prepared,
            )
        })
        .await?;
    assert!(receipt.duplicate);
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn sealed_raster_retirement_requires_pinned_evidence_even_for_empty_and_partial_files()
-> TestResult {
    for (offset, prefix) in
        [b"".as_slice(), b"partial raster record".as_slice()].into_iter().enumerate()
    {
        let fixture = Box::pin(fixture()).await?;
        let root = &fixture.bootstrap.operational_root;
        let before = files(root)?;
        let stage = fixture.stage()?;
        retain(&stage, prefix)?;
        let pending = files(root)?;
        let observed = fixture.inspect().await?;
        assert!(observed.upload.published_asset.is_none());
        assert_eq!(observed.upload.evidence_bytes(), prefix);
        assert_eq!(observed.upload.evidence_sha256, <[u8; 32]>::from(Sha256::digest(prefix)));
        let (selected, mut retained) = fixture.retain(observed)?;
        let pin = retained.selection_sha256;
        let evidence = retained.evidence.clone();
        let archive = retained.archive.clone();
        retained.selection_sha256[offset] ^= 1;
        let (auth, owner, _) = authentication()?;
        assert!(matches!(
            retire_sealed_native_raster_upload(selected, retained, auth, "owner", &owner).await,
            Err(Error::Contract("sealed raster retained evidence differs"))
        ));
        assert_eq!(files(root)?, pending);
        let mut selected = fixture.selected();
        selected.expected_current = fixture.accepted.clone();
        let (auth, owner, _) = authentication()?;
        let retained = SealedNativeRasterUploadRecoveryFiles {
            archive,
            evidence: evidence.clone(),
            selection_sha256: pin,
        };
        let completed =
            retire_sealed_native_raster_upload(selected, retained, auth, "owner", &owner)
                .await?
                .identity()?;
        assert_eq!(completed, fixture.accepted);
        assert_eq!(fs::read(evidence)?, prefix);
        assert_eq!(files(root)?, before);
    }
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn sealed_raster_inspection_refuses_unrelated_links_multiple_stages_and_wrong_auth()
-> TestResult {
    let fixture = Box::pin(fixture()).await?;
    let stage = fixture.stage()?;
    retain(&stage, b"unpublished")?;
    let (auth, _, reader) = authentication()?;
    assert!(matches!(
        inspect_sealed_native_raster_upload(fixture.selected(), None, auth, "owner", &reader).await,
        Err(Error::Permission)
    ));
    let outside = fixture.source.directory.0.join("unrelated-link");
    fs::hard_link(&stage, &outside)?;
    assert!(matches!(
        fixture.inspect().await,
        Err(error) if matches!(error.downcast_ref::<Error>(),
            Some(Error::Contract("pending raster upload has unrelated links")))
    ));
    fs::remove_file(outside)?;
    let second = fixture.stage()?;
    retain(&second, b"another stage")?;
    assert!(matches!(
        fixture.inspect().await,
        Err(error) if matches!(error.downcast_ref::<Error>(),
            Some(Error::Contract("multiple pending raster uploads")))
    ));
    assert_eq!(fs::read(stage)?, b"unpublished");
    assert_eq!(fs::read(second)?, b"another stage");
    Ok(())
}
