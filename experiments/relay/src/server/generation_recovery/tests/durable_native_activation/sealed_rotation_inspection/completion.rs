//! Retain real selected evidence and drive sealed completion and subsequent cold admission.
use super::{Fixture, RotationPoint, TestResult, authentication, pending_at, sorted_files};
use crate::{
    Error,
    server::{
        SealedNativeRestartBootstrapCoverage, SealedNativeRotationCompletionFiles,
        SealedNativeRotationInspection, complete_sealed_native_rotation,
        generation_recovery::complete_sealed_rotation::{
            RotationCompletionInterruption, complete_sealed_native_rotation_with_interruption,
        },
        inspect_sealed_native_restart, inspect_sealed_native_rotation,
        reopen_sealed_native_restart_host,
    },
};
use std::{fs, io::Write, os::unix::fs::OpenOptionsExt, path::Path};

mod raster;

fn retain_file(path: &Path, bytes: &[u8]) -> TestResult {
    let mut file = fs::OpenOptions::new().write(true).create_new(true).mode(0o600).open(path)?;
    file.write_all(bytes)?;
    Ok(())
}

fn retain(
    fixture: &Fixture,
    inspection: SealedNativeRotationInspection,
    name: &str,
) -> TestResult<(crate::server::SealedNativeRestartBootstrap, SealedNativeRotationCompletionFiles)>
{
    let mut selected = fixture.selected();
    selected.expected_current = inspection.state.identity()?;
    let directory = &fixture.source.directory.0;
    let archive = directory.join(format!("{name}.archive"));
    let evidence = directory.join(format!("{name}.evidence"));
    retain_file(&evidence, inspection.rotation.evidence_bytes())?;
    let (server, _) = inspection.state.into_parts();
    retain_file(&archive, &server.to_bytes()?)?;
    Ok((
        selected,
        SealedNativeRotationCompletionFiles {
            archive,
            evidence,
            evidence_sha256: inspection.rotation.evidence_sha256,
        },
    ))
}

async fn inspect(fixture: &Fixture) -> TestResult<SealedNativeRotationInspection> {
    let (auth, owner, _) = authentication()?;
    Ok(Box::pin(inspect_sealed_native_rotation(fixture.selected(), None, auth, "owner", &owner))
        .await?)
}

async fn check_restart(
    fixture: &Fixture,
    completed: &crate::server::ServerLogGenerationRecoveryStateIdentity,
) -> TestResult {
    let mut selected = fixture.selected();
    selected.expected_current = completed.clone();
    let (auth, owner, _) = authentication()?;
    let reopened = Box::pin(reopen_sealed_native_restart_host(
        selected,
        auth,
        "owner",
        &owner,
        fixture.source.protected_records(),
    ))
    .await?;
    let SealedNativeRestartBootstrapCoverage::Verified(reopened) = reopened else {
        return Err("protected restart registrations missing".into());
    };
    assert_eq!(reopened.proof.identity(), *completed);
    reopened
        .host
        .host
        .transaction(|room| {
            room.catchup("accepted-before-rotation")?;
            Ok(())
        })
        .await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn completes_sealed_rotation_and_reopens_with_all_protected_registrations() -> TestResult {
    for point in [RotationPoint::IntentSynced, RotationPoint::HeadSynced] {
        let (fixture, accepted) = Box::pin(pending_at(point)).await?;
        let inspection = Box::pin(inspect(&fixture)).await?;
        let after = inspection.rotation.after_manifest;
        let root = &fixture.bootstrap.operational_root;
        let before = sorted_files(root)?;
        let ledger = sorted_files(&fixture.bootstrap.authority_root)?;

        let (selected, mut retained) = retain(&fixture, inspection, "completion")?;
        retained.evidence_sha256[0] ^= 1;
        let (auth, owner, _) = authentication()?;
        assert!(matches!(
            Box::pin(complete_sealed_native_rotation(selected, retained, auth, "owner", &owner))
                .await,
            Err(Error::Contract("sealed rotation retained evidence differs"))
        ));
        assert_eq!(sorted_files(root)?, before);

        let inspection = Box::pin(inspect(&fixture)).await?;
        let (selected, retained) = retain(&fixture, inspection, "verified-completion")?;
        let (auth, owner, _) = authentication()?;
        let completed =
            Box::pin(complete_sealed_native_rotation(selected, retained, auth, "owner", &owner))
                .await?
                .identity()?;
        let original = accepted.identity()?;
        assert_eq!(completed.server.native.manifest, after);
        assert_eq!(completed.server.native.source, original.server.native.source);
        assert_eq!(completed.server.assets, original.server.assets);
        assert_eq!(sorted_files(&fixture.bootstrap.authority_root)?, ledger);
        assert!(sorted_files(root)?.iter().all(|(path, _)| {
            let name = path.file_name().unwrap_or_default().to_string_lossy();
            name != ".rotation.json" && !name.starts_with(".rotation-recovery-")
        }));
        Box::pin(check_restart(&fixture, &completed)).await?;
    }
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn interrupted_sealed_completion_resumes_from_fresh_pins_and_detects_lost_reply() -> TestResult
{
    let (fixture, accepted) = Box::pin(pending_at(RotationPoint::IntentSynced)).await?;
    let ledger = sorted_files(&fixture.bootstrap.authority_root)?;
    let mut previous_digest = None;
    for (name, point) in [
        ("manifest-prefix", RotationPoint::RecoveryManifestPrefix),
        ("head-prefix", RotationPoint::RecoveryHeadPrefix),
        ("selected-head", RotationPoint::HeadSynced),
        ("retired-intent", RotationPoint::IntentRetired),
    ] {
        let inspection = Box::pin(inspect(&fixture)).await?;
        assert_ne!(previous_digest, Some(inspection.rotation.evidence_sha256));
        previous_digest = Some(inspection.rotation.evidence_sha256);
        let (selected, retained) = retain(&fixture, inspection, name)?;
        let (auth, owner, _) = authentication()?;
        assert!(matches!(
            Box::pin(complete_sealed_native_rotation_with_interruption(
                selected,
                retained,
                auth,
                "owner",
                &owner,
                RotationCompletionInterruption { stop_at: Some(point) },
            ))
            .await,
            Err(Error::Contract("test interruption after durable physical prefix"))
        ));
        assert_eq!(sorted_files(&fixture.bootstrap.authority_root)?, ledger);
    }
    let (auth, owner, _) = authentication()?;
    let completed =
        Box::pin(inspect_sealed_native_restart(fixture.selected(), None, auth, "owner", &owner))
            .await?
            .identity()?;
    let original = accepted.identity()?;
    assert_ne!(completed.server.native.manifest, original.server.native.manifest);
    assert_eq!(completed.server.native.source, original.server.native.source);
    assert_eq!(completed.server.assets, original.server.assets);
    Box::pin(check_restart(&fixture, &completed)).await
}
