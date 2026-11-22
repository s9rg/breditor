//! Independently selected native metadata is necessary even with valid checksums and auth.
use super::super::prepare_log_generation_recovery_host;
use super::source::{POLICY, Source, TestResult, authentication};
use crate::{Error, OperationalLogGenerationServerRoom, ServerLogGenerationParticipantInventory};
use sha2::{Digest, Sha256};

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn preparation_rejects_wrong_current_auth_or_origin_without_changing_recovered_native_files()
-> TestResult {
    for wrong in ["token", "owner", "origin"] {
        let source = Source::new((3, true), true, true, true)?;
        let operation = source.operation("selected")?;
        let destination = operation.root().to_owned();
        let (auth, owner, reader) = authentication()?;
        let mut expected = source.original.info()?.identity;
        if wrong == "origin" {
            expected.native.manifest[0] ^= 1;
        }
        let before = source.original.to_bytes()?;
        let principal = if wrong == "owner" { "reader" } else { "owner" };
        let token = if wrong == "origin" { &owner } else { &reader };
        assert!(
            Box::pin(prepare_log_generation_recovery_host(
                operation,
                auth,
                source.original_copy()?,
                &expected,
                principal,
                token
            ))
            .await
            .is_err(),
            "{wrong}"
        );
        let mut current = OperationalLogGenerationServerRoom::resume(
            &destination,
            &source.original,
            &source.original.info()?.identity,
            POLICY,
            "owner",
        )?;
        current.check_live_source(&source.original, "owner")?;
        let (authority, assets) = current.components_mut();
        assert_eq!(
            crate::ServerLogGenerationRoomBackup::capture(authority, assets, "owner")?
                .to_bytes()?,
            before
        );
    }
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn checksum_valid_omitted_native_streams_and_wrong_origin_cannot_produce_host_proofs()
-> TestResult {
    let source = Source::new((3, true), true, true, true)?;
    let (auth, owner, _) = authentication()?;
    let handle = Box::pin(prepare_log_generation_recovery_host(
        source.operation("selected")?,
        auth,
        source.original_copy()?,
        &source.original.info()?.identity,
        "owner",
        &owner,
    ))
    .await?;
    let state = handle.capture_recovery_state("owner", &owner).await?;
    let mut expected = state.identity()?;
    let (_, inventory) = state.into_parts();
    let mut metadata = inventory.metadata();
    metadata.native.writers.retain(|stream| stream.principal != "revoked");
    let json = serde_json::to_string(&metadata)?;
    expected.participants.sha256 = Sha256::digest(json.as_bytes()).into();
    let admitted =
        ServerLogGenerationParticipantInventory::from_json(&json, &expected.participants)?;
    assert!(
        handle
            .verify_selected_recovery_state(
                "owner",
                &owner,
                expected,
                admitted,
                source.protected_records()
            )
            .await
            .is_err()
    );
    let state = handle.capture_recovery_state("owner", &owner).await?;
    let mut expected = state.identity()?;
    let (_, inventory) = state.into_parts();
    expected.origin.archive_sha256[0] ^= 1;
    assert!(matches!(
        handle
            .verify_selected_recovery_state(
                "owner",
                &owner,
                expected,
                inventory,
                source.protected_records()
            )
            .await,
        Err(Error::Contract(_))
    ));
    Ok(())
}
