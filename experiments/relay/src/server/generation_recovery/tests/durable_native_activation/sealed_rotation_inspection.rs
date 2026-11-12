//! Real sealed operational history and physical rotation artifacts stay intact during inspection.
use super::{POLICY, Setup, TestResult, authentication, faults::captured_files, prepare};
use crate::{
    Error, Role, ServerLogGenerationRoomRecovery,
    log::generations::RotationPoint,
    server::{
        SealedNativeRestartBootstrap, ServerLogGenerationRecoveryState,
        inspect_sealed_native_restart, inspect_sealed_native_rotation,
    },
};
use sha2::{Digest, Sha256};
use std::{
    fs,
    path::{Path, PathBuf},
};

struct Fixture {
    source: super::Source,
    authority: crate::server::RoomDeploymentAuthority,
    bootstrap: SealedNativeRestartBootstrap,
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
}

async fn pending_at(
    point: RotationPoint,
) -> TestResult<(Fixture, ServerLogGenerationRecoveryState)> {
    let setup = Box::pin(Setup::new((3, true), true, (true, true), true)).await?;
    let proof = setup.proof().await?;
    let checkpoint = prepare(&setup, "sealed-pending-rotation", &proof).await?;
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
    host.transaction(|room| room.grant("owner", "accepted-before-rotation", Some(Role::Reader)))
        .await?;
    let accepted = setup.handle.capture_recovery_state("owner", &setup.owner).await?;
    assert!(matches!(
        host.transaction(move |room| {
            room.interrupt_log_rotation_for_test(point)?;
            room.rotate_log_generation("owner", "pending-inspection")?;
            Ok(())
        })
        .await,
        Err(Error::Contract("test interruption after durable physical prefix"))
    ));
    let bootstrap = SealedNativeRestartBootstrap {
        source_root: setup.intent.root().to_owned(),
        checkpoint_root: checkpoint.root().to_owned(),
        authority_root: setup.source.directory.0.join("authority"),
        operational_root: setup.source.directory.0.join("target"),
        expected_current: expected_checkpoint.current().clone(),
        expected_checkpoint,
    };
    drop(active);
    drop(setup.handle);
    drop(checkpoint);
    drop(setup.intent);
    Ok((Fixture { source: setup.source, authority: setup.authority, bootstrap }, accepted))
}

fn sorted_files(path: &Path) -> TestResult<Vec<(PathBuf, Vec<u8>)>> {
    let mut files = captured_files(path)?;
    files.sort();
    Ok(files)
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn sealed_rotation_inspection_preserves_exact_accepted_history_at_both_head_phases()
-> TestResult {
    for (point, published) in
        [(RotationPoint::IntentSynced, false), (RotationPoint::HeadSynced, true)]
    {
        let (fixture, accepted) = Box::pin(pending_at(point)).await?;
        let accepted_identity = accepted.identity()?;
        let (accepted_archive, _) = accepted.into_parts();
        let root = &fixture.bootstrap.operational_root;
        let before = sorted_files(root)?;
        let ledger = sorted_files(&fixture.bootstrap.authority_root)?;
        let (auth, owner, _) = authentication()?;
        assert!(
            Box::pin(inspect_sealed_native_restart(
                fixture.selected(),
                None,
                auth,
                "owner",
                &owner
            ))
            .await
            .is_err()
        );
        let (auth, owner, _) = authentication()?;
        let mut selected = fixture.selected();
        selected.expected_current = accepted_identity.clone();
        let result = Box::pin(inspect_sealed_native_rotation(
            selected,
            Some(accepted_archive),
            auth,
            "owner",
            &owner,
        ))
        .await?;
        assert_eq!(result.rotation.next_generation, "pending-inspection");
        assert_eq!(
            result.rotation.evidence_sha256,
            <[u8; 32]>::from(Sha256::digest(result.rotation.evidence_bytes())),
        );
        assert_eq!(result.rotation.head_published, published);
        assert_eq!(result.rotation.before_manifest, accepted_identity.server.native.manifest);
        let current = result.state.identity()?;
        let evidence: serde_json::Value = serde_json::from_slice(result.rotation.evidence_bytes())?;
        assert_eq!(evidence["formatVersion"], 1);
        assert_eq!(
            evidence["selectedManifest"],
            serde_json::to_value(current.server.native.manifest)?,
        );
        assert_eq!(current.server.native.source, accepted_identity.server.native.source);
        assert_eq!(current.server.assets, accepted_identity.server.assets);
        assert_eq!(
            current.server.native.manifest,
            if published {
                result.rotation.after_manifest
            } else {
                result.rotation.before_manifest
            },
        );
        if !published {
            assert_eq!(current, accepted_identity);
        }
        let (auth, owner, _) = authentication()?;
        let observed_again = Box::pin(inspect_sealed_native_rotation(
            fixture.selected(),
            None,
            auth,
            "owner",
            &owner,
        ))
        .await?;
        assert_eq!(observed_again.rotation, result.rotation);
        assert_eq!(observed_again.state.identity()?, current);
        let (archive, _) = result.state.into_parts();
        let restored = ServerLogGenerationRoomRecovery::begin(
            &fixture.source.directory.0.join("inspected-rotation"),
            &archive,
            &current.server,
            POLICY,
        )?
        .finish(&archive)?;
        assert!(restored.room().catchup("accepted-before-rotation").is_ok());
        assert_eq!(sorted_files(root)?, before);
        assert_eq!(sorted_files(&fixture.bootstrap.authority_root)?, ledger);
    }
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn sealed_rotation_inspection_refuses_wrong_auth_bad_continuation_and_stale_epoch()
-> TestResult {
    let (fixture, _) = Box::pin(pending_at(RotationPoint::IntentSynced)).await?;
    let root = &fixture.bootstrap.operational_root;
    let initial = sorted_files(root)?;
    let (auth, _, reader) = authentication()?;
    assert!(matches!(
        Box::pin(inspect_sealed_native_rotation(fixture.selected(), None, auth, "owner", &reader))
            .await,
        Err(Error::Permission)
    ));
    assert_eq!(sorted_files(root)?, initial);
    let (marker_path, marker_bytes) = initial
        .iter()
        .find(|(path, _)| path.file_name().is_some_and(|name| name == ".rotation.json"))
        .ok_or("pending intent")?;
    let marker: serde_json::Value = serde_json::from_slice(marker_bytes)?;
    let stage = marker_path.with_file_name(marker["stage"].as_str().ok_or("continuation alias")?);
    fs::write(&stage, b"unexpected continuation bytes")?;
    let changed = sorted_files(root)?;
    let (auth, owner, _) = authentication()?;
    assert!(matches!(
        Box::pin(inspect_sealed_native_rotation(fixture.selected(), None, auth, "owner", &owner))
            .await,
        Err(Error::Contract("pending rotation continuation differs"))
    ));
    assert_eq!(sorted_files(root)?, changed);
    fs::write(stage, [])?;
    let _superseded = fixture.authority.claim(&fixture.authority.current_selection()?)?;
    let (auth, owner, _) = authentication()?;
    assert!(matches!(
        Box::pin(inspect_sealed_native_rotation(fixture.selected(), None, auth, "owner", &owner))
            .await,
        Err(Error::Lease)
    ));
    assert_eq!(sorted_files(root)?, initial);
    Ok(())
}
