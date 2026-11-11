//! A torn active frame keeps the sealed operation, acknowledged cut and exact suffix.
use super::{POLICY, Setup, TestResult, authentication, faults::captured_files, prepare};
use crate::{
    Error, Role, ServerLogGenerationRoomRecovery,
    server::{
        RoomDeploymentAuthority, SealedNativeRestartBootstrap, ServerLogGenerationRecoveryState,
        ServerLogGenerationRecoveryStateIdentity, inspect_sealed_native_restart,
        inspect_sealed_native_tail,
    },
};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
};

fn append_partial_frame(path: &Path, suffix: &[u8]) -> TestResult {
    let mut wal = fs::OpenOptions::new().append(true).open(path)?;
    wal.write_all(suffix)?;
    wal.sync_all()?;
    Ok(())
}

const SUFFIX: [u8; 8] = [0, 0, 0, 0, 0, 0, 0, 120];

struct ClosedTailFixture {
    source: super::Source,
    authority: RoomDeploymentAuthority,
    selected: SealedNativeRestartBootstrap,
    active_wal: PathBuf,
}

impl ClosedTailFixture {
    fn bootstrap(
        &self,
        expected_current: ServerLogGenerationRecoveryStateIdentity,
    ) -> SealedNativeRestartBootstrap {
        SealedNativeRestartBootstrap {
            source_root: self.selected.source_root.clone(),
            checkpoint_root: self.selected.checkpoint_root.clone(),
            authority_root: self.selected.authority_root.clone(),
            operational_root: self.selected.operational_root.clone(),
            expected_checkpoint: self.selected.expected_checkpoint.clone(),
            expected_current,
        }
    }
}

async fn close_with_torn_frame() -> TestResult<(ClosedTailFixture, ServerLogGenerationRecoveryState)>
{
    let setup = Box::pin(Setup::new((3, true), true, (true, true), true)).await?;
    let proof = setup.proof().await?;
    let checkpoint = prepare(&setup, "sealed-torn-inspection", &proof).await?;
    let expected_checkpoint = checkpoint.identity().clone();
    let operational_root = setup.source.directory.0.join("target");
    let before_edit = captured_files(&operational_root)?;
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
    active
        .recovery_host()
        .host
        .transaction(|room| room.grant("owner", "accepted-before-torn-frame", Some(Role::Reader)))
        .await?;
    let accepted = setup.handle.capture_recovery_state("owner", &setup.owner).await?;
    let accepted_files = captured_files(&operational_root)?;
    let mut changed = accepted_files.iter().filter(|(path, bytes)| {
        path.extension().is_some_and(|ext| ext == "wal")
            && !before_edit
                .iter()
                .any(|(old_path, old_bytes)| old_path == path && old_bytes == bytes)
    });
    let (active_wal, _) = changed.next().ok_or("accepted operation advanced its active WAL")?;
    assert!(changed.next().is_none());

    let source_root = setup.intent.root().to_owned();
    let checkpoint_root = checkpoint.root().to_owned();
    let authority_root = setup.source.directory.0.join("authority");
    drop(active);
    drop(setup.handle);
    drop(checkpoint);
    drop(setup.intent);
    append_partial_frame(active_wal, &SUFFIX)?;

    let expected_current = expected_checkpoint.current().clone();
    Ok((
        ClosedTailFixture {
            source: setup.source,
            authority: setup.authority,
            selected: SealedNativeRestartBootstrap {
                source_root,
                checkpoint_root,
                authority_root,
                operational_root,
                expected_checkpoint,
                expected_current,
            },
            active_wal: active_wal.clone(),
        },
        accepted,
    ))
}

fn sorted_files(path: &Path) -> TestResult<Vec<(PathBuf, Vec<u8>)>> {
    let mut files = captured_files(path)?;
    files.sort();
    Ok(files)
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn authenticated_torn_tail_preserves_the_sealed_owner_complete_cut_and_exact_suffix()
-> TestResult {
    let (fixture, accepted) = Box::pin(close_with_torn_frame()).await?;
    let checkpoint_cut = fixture.selected.expected_current.clone();
    let accepted_cut = accepted.identity()?;
    assert_ne!(accepted_cut, checkpoint_cut);
    let (accepted_archive, accepted_participants) = accepted.into_parts();
    let target_files = sorted_files(&fixture.selected.operational_root)?;
    let ledger = sorted_files(&fixture.selected.authority_root)?;
    let checkpoint_files = sorted_files(&fixture.selected.checkpoint_root)?;
    let source_files = sorted_files(&fixture.selected.source_root)?;
    Box::pin(assert_inspection_refusals(
        fixture.bootstrap(checkpoint_cut.clone()),
        fixture.bootstrap(checkpoint_cut.clone()),
        fixture.bootstrap(accepted_cut.clone()),
    ))
    .await?;
    let (auth, owner, _) = authentication()?;
    let inspected = Box::pin(inspect_sealed_native_tail(
        fixture.bootstrap(checkpoint_cut.clone()),
        None,
        auth,
        "owner",
        &owner,
    ))
    .await?;
    assert_eq!(inspected.state.identity()?, accepted_cut);
    assert_eq!(inspected.incomplete_suffix(), SUFFIX);
    assert_eq!(inspected.incomplete_bytes, SUFFIX.len() as u64);
    assert_eq!(inspected.incomplete_sha256, <[u8; 32]>::from(Sha256::digest(SUFFIX)));
    let (recovered, participants) = inspected.state.into_parts();
    assert_eq!(participants.to_json(), accepted_participants.to_json());
    assert_eq!(recovered.to_bytes()?, accepted_archive.to_bytes()?);

    let (auth, owner, _) = authentication()?;
    let selected = Box::pin(inspect_sealed_native_tail(
        fixture.bootstrap(accepted_cut.clone()),
        Some(accepted_archive),
        auth,
        "owner",
        &owner,
    ))
    .await?;
    assert_eq!(selected.state.identity()?, accepted_cut);
    Box::pin(assert_unrelated_operation_refuses(
        &fixture.source,
        fixture.bootstrap(checkpoint_cut.clone()),
        &fixture.active_wal,
        &SUFFIX,
    ))
    .await?;

    let separate = fixture.source.directory.0.join("restored-sealed-prefix");
    let restored = ServerLogGenerationRoomRecovery::begin(
        &separate,
        &recovered,
        &accepted_cut.server,
        POLICY,
    )?
    .finish(&recovered)?;
    assert!(restored.room().catchup("accepted-before-torn-frame").is_ok());

    assert_eq!(sorted_files(&fixture.selected.operational_root)?, target_files);
    assert_eq!(sorted_files(&fixture.selected.authority_root)?, ledger);
    assert_eq!(sorted_files(&fixture.selected.checkpoint_root)?, checkpoint_files);
    assert_eq!(sorted_files(&fixture.selected.source_root)?, source_files);

    let epoch = fixture.authority.current_selection()?;
    let _superseded = fixture.authority.claim(&epoch)?;
    let (auth, owner, _) = authentication()?;
    assert!(matches!(
        Box::pin(inspect_sealed_native_tail(
            fixture.bootstrap(checkpoint_cut),
            None,
            auth,
            "owner",
            &owner,
        ))
        .await,
        Err(Error::Lease)
    ));
    assert_eq!(sorted_files(&fixture.selected.operational_root)?, target_files);
    Ok(())
}

async fn assert_inspection_refusals(
    wrong_account: SealedNativeRestartBootstrap,
    normal: SealedNativeRestartBootstrap,
    unpinned: SealedNativeRestartBootstrap,
) -> TestResult {
    let (auth, _, reader) = authentication()?;
    assert!(matches!(
        Box::pin(inspect_sealed_native_tail(wrong_account, None, auth, "owner", &reader)).await,
        Err(Error::Permission)
    ));
    let (auth, owner, _) = authentication()?;
    assert!(matches!(
        Box::pin(inspect_sealed_native_restart(normal, None, auth, "owner", &owner)).await,
        Err(Error::Contract("operational generation log has an incomplete tail"))
    ));
    let (auth, owner, _) = authentication()?;
    assert!(matches!(
        Box::pin(inspect_sealed_native_tail(unpinned, None, auth, "owner", &owner)).await,
        Err(Error::Contract("sealed inspection minimum archive differs"))
    ));
    Ok(())
}

async fn assert_unrelated_operation_refuses(
    source: &super::Source,
    mut selected: SealedNativeRestartBootstrap,
    original_wal: &Path,
    suffix: &[u8],
) -> TestResult {
    let foreign = source.operation("foreign-torn-operation")?;
    selected.operational_root = foreign.root().to_owned();
    drop(foreign);
    let foreign_files = captured_files(&selected.operational_root)?;
    let (foreign_wal, _) = foreign_files
        .iter()
        .find(|(path, _)| path.file_name() == original_wal.file_name())
        .ok_or("matching active WAL in independently restored operation")?;
    append_partial_frame(foreign_wal, suffix)?;
    let (auth, owner, _) = authentication()?;
    assert!(matches!(
        Box::pin(inspect_sealed_native_tail(selected, None, auth, "owner", &owner)).await,
        Err(Error::Contract("sealed restart operational owner differs"))
    ));
    Ok(())
}
