//! Detached metadata and credentials do not make a proof portable between owners or sources.
use super::{super::source::TestResult, fixture::PhysicalSource};
use crate::{
    ServerLogGenerationParticipantInventory,
    server::{PhysicalServerRoomRecoveryCoverage, prepare_physical_room_recovery_host},
};
use sha2::{Digest, Sha256};

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn proof_requires_current_auth_exact_host_and_exact_ancestor_even_on_same_native_owner()
-> TestResult {
    let source = PhysicalSource::new((3, true), true, true, true)?;
    let (host, local, owner, reader) = source.paired_host("proof-scope").await?;
    let state = host.capture_recovery_state("owner", &owner).await?;
    let expected = state.identity()?;
    let (_, inventory) = state.into_parts();
    let PhysicalServerRoomRecoveryCoverage::Verified(proof) = host
        .verify_selected_recovery_state(
            "owner",
            &owner,
            expected.clone(),
            inventory,
            source.source.protected_records(),
        )
        .await?
    else {
        return Err("complete credentials did not verify".into());
    };
    assert!(proof.check_live(&host, "owner", &reader).await.is_err());
    assert!(proof.check_live(&host, "reader", &reader).await.is_err());
    let different_ancestor = prepare_physical_room_recovery_host(
        local.clone(),
        source.local_copy()?,
        &source.local.info()?.identity,
        &source.local.info()?.identity,
        "owner",
        &owner,
    )
    .await?;
    assert!(proof.check_live(&different_ancestor, "owner", &owner).await.is_err());
    let (other, other_owner, _) = source.physical_host("different-native-owner").await?;
    assert_eq!(other.capture_recovery_state("owner", &other_owner).await?.identity()?, expected);
    assert!(proof.check_live(&other, "owner", &other_owner).await.is_err());
    proof.check_live(&host, "owner", &owner).await?;
    assert_eq!(host.capture_recovery_state("owner", &owner).await?.identity()?, expected);
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn checksum_valid_omission_of_revoked_native_stream_is_not_a_complete_physical_proof()
-> TestResult {
    let source = PhysicalSource::new((3, true), true, true, true)?;
    let (host, owner, _) = source.physical_host("omitted-native-stream").await?;
    let state = host.capture_recovery_state("owner", &owner).await?;
    let before = state.identity()?;
    let (_, inventory) = state.into_parts();
    let mut metadata = inventory.metadata();
    let count = metadata.native.writers.len();
    metadata.native.writers.retain(|writer| writer.principal != "revoked");
    assert_eq!(metadata.native.writers.len() + 1, count);
    let json = serde_json::to_string(&metadata)?;
    let mut expected = before.clone();
    expected.participants.sha256 = Sha256::digest(json.as_bytes()).into();
    let admitted =
        ServerLogGenerationParticipantInventory::from_json(&json, &expected.participants)?;
    assert!(
        host.verify_selected_recovery_state(
            "owner",
            &owner,
            expected,
            admitted,
            source.source.protected_records(),
        )
        .await
        .is_err()
    );
    assert_eq!(host.capture_recovery_state("owner", &owner).await?.identity()?, before);
    Ok(())
}
