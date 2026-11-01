//! Actual absent-only replay, independent history families and later offline work.
use super::source::{POLICY, Source, TestResult, authentication, insert, send};
use crate::{
    Error, OperationalLogGenerationServerRoom,
    server::{ServerLogGenerationRecoveryCoverage, reconstruct_log_generation_recovery_host},
};
use std::fs;

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn reconstructed_host_all_forty_native_modes_keep_exact_bytes_and_protected_streams()
-> TestResult {
    for profile in [(1, false), (2, false), (2, true), (3, false), (3, true)] {
        for atomic in [false, true] {
            for document in [false, true] {
                for review in [false, true] {
                    let source = Source::new(profile, atomic, document, review)?;
                    let expected = source.original.info()?.identity;
                    let (auth, owner, _) = authentication()?;
                    let handle = reconstruct_log_generation_recovery_host(
                        &source.directory.0.join("replayed"),
                        auth,
                        source.original_copy()?,
                        &expected,
                        "owner",
                        &owner,
                    )
                    .await?;
                    let state = handle.capture_recovery_state("owner", &owner).await?;
                    let actual = state.identity()?;
                    let (backup, inventory) = state.into_parts();
                    assert_eq!(actual.origin, expected);
                    assert_eq!(actual.server, expected);
                    assert_eq!(backup.to_bytes()?, source.original.to_bytes()?);
                    let ServerLogGenerationRecoveryCoverage::Verified(proof) = handle
                        .verify_selected_recovery_state(
                            "owner",
                            &owner,
                            actual.clone(),
                            inventory,
                            source.protected_records(),
                        )
                        .await?
                    else {
                        return Err("actual original protected streams missing".into());
                    };
                    proof.check_live(&handle, "owner", &owner).await?;
                    let assets = handle.capture_asset_recovery_state("owner", &owner).await?;
                    assert_eq!(assets.current, actual);
                    assert_eq!(assets.references.source, expected.native);
                    let lease = source.author.lease.clone();
                    handle
                        .host
                        .transaction(move |room| {
                            assert!(room.validate_lease("owner", &lease).is_err());
                            assert!(room.catchup("revoked").is_err());
                            Ok(())
                        })
                        .await?;
                }
            }
        }
    }
    Ok(())
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn reconstructed_host_wrong_auth_owner_and_selection_create_no_target() -> TestResult {
    let source = Source::new((3, true), true, true, true)?;
    let expected = source.original.info()?.identity;
    for mode in [0, 1, 2] {
        let target = source.directory.0.join(format!("refuse-{mode}"));
        let (auth, owner, reader) = authentication()?;
        let mut selected = expected.clone();
        if mode == 2 {
            selected.archive_sha256[0] ^= 1;
        }
        let (principal, token) = if mode == 1 {
            ("reader", reader.as_str())
        } else if mode == 0 {
            ("owner", reader.as_str())
        } else {
            ("owner", owner.as_str())
        };
        assert!(
            reconstruct_log_generation_recovery_host(
                &target,
                auth,
                source.original_copy()?,
                &selected,
                principal,
                token
            )
            .await
            .is_err()
        );
        assert!(!target.exists());
    }
    Ok(())
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn reconstructed_host_occupied_paths_are_never_adopted_or_overwritten() -> TestResult {
    let source = Source::new((3, true), true, true, true)?;
    let expected = source.original.info()?.identity;
    for directory in [false, true] {
        let target =
            source.directory.0.join(if directory { "occupied-dir" } else { "occupied-file" });
        let sentinel = if directory {
            fs::create_dir(&target)?;
            target.join("sentinel")
        } else {
            target.clone()
        };
        fs::write(&sentinel, b"original retained data")?;
        let (auth, owner, _) = authentication()?;
        assert!(
            reconstruct_log_generation_recovery_host(
                &target,
                auth,
                source.original_copy()?,
                &expected,
                "owner",
                &owner
            )
            .await
            .is_err()
        );
        assert_eq!(fs::read(&sentinel)?, b"original retained data");
    }
    Ok(())
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn reconstructed_host_drops_to_explicit_resume_and_keeps_later_offline_undo() -> TestResult {
    let source = Source::new((3, true), true, true, true)?;
    let target = source.directory.0.join("inactive");
    let expected = source.original.info()?.identity;
    let (auth, owner, reader) = authentication()?;
    let handle = reconstruct_log_generation_recovery_host(
        &target,
        auth,
        source.original_copy()?,
        &expected,
        "owner",
        &owner,
    )
    .await?;
    assert!(matches!(
        handle.capture_recovery_state("reader", &reader).await,
        Err(Error::Permission)
    ));
    drop(handle);
    let mut operational = OperationalLogGenerationServerRoom::resume(
        &target,
        &source.original,
        &expected,
        POLICY,
        "owner",
    )?;
    let (room, assets) = operational.components_mut();
    let peer = room.register("owner")?;
    let mut peer_document = source.profile.join_frame(
        "room".into(),
        peer.lease.writer.clone(),
        &room.catchup("owner")?,
    )?;
    insert(&mut peer_document, "Peer preserved ")?;
    send(room, &peer_document, "owner", &peer.lease, "0", true)?;
    let lease = room.resume("owner", &source.author.lease.writer, &source.author.credential)?;
    let mut author = source.profile.restore("room", &source.offline)?;
    author.receive_frame(&room.catchup("owner")?)?;
    let mut through = send(room, &author, "owner", &lease, &source.through, true)?;
    for redo in [false, true] {
        assert!(if redo { author.redo()? } else { author.undo()? });
        through = send(room, &author, "owner", &lease, &through, true)?;
        assert!(author.document_json().contains("Peer preserved "));
        assert_eq!(author.document_json().contains("Old offline "), redo);
    }
    super::workflows::merge_review_after_host(room, &author, &peer_document, &source)?;
    assert_eq!(assets.count(), 3);
    operational.check_live_source(&source.original, "owner")?;
    Ok(())
}
