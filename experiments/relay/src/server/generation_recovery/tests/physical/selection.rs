//! False independent pins and credentials do not change genuine restored B files.
use super::super::source::TestResult;
use super::fixture::PhysicalSource;
use crate::{
    RecoveryRegistrationCredentials,
    server::{
        PhysicalServerRoomRecoveryCoverage, PhysicalServerRoomRecoveryStateIdentity,
        prepare_physical_room_recovery_host,
    },
};

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn wrong_auth_ancestor_or_local_origin_refuses_without_relabeling_the_old_host() -> TestResult
{
    let fixture = PhysicalSource::new((3, true), true, true, true)?;
    let (local, owner, reader) = fixture.local_host("refusal").await?;
    let before = local.capture_recovery_state("owner", &owner).await?.identity()?;
    for wrong in ["token", "ancestor", "local"] {
        let mut ancestor = fixture.source.original.info()?.identity;
        let mut origin = fixture.local.info()?.identity;
        if wrong == "ancestor" {
            ancestor.native.manifest[0] ^= 1;
        }
        if wrong == "local" {
            origin = fixture.source.original.info()?.identity;
        }
        let token = if wrong == "token" { &reader } else { &owner };
        assert!(
            prepare_physical_room_recovery_host(
                local.clone(),
                fixture.source.original_copy()?,
                &ancestor,
                &origin,
                "owner",
                token
            )
            .await
            .is_err(),
            "{wrong}"
        );
        assert_eq!(local.capture_recovery_state("owner", &owner).await?.identity()?, before);
    }
    Ok(())
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn selected_physical_metadata_requires_native_sources_and_all_current_protected_streams()
-> TestResult {
    let fixture = PhysicalSource::new((3, true), true, true, true)?;
    let (host, owner, _) = fixture.physical_host("selected").await?;
    let state = host.capture_recovery_state("owner", &owner).await?;
    let expected = state.identity()?;
    let (_, inventory) = state.into_parts();
    for wrong in ["family", "version", "ancestor", "local", "server", "participants"] {
        let mut bad = expected.clone();
        match wrong {
            "family" => bad.format = "breditor/server-log-generation-recovery-state".into(),
            "version" => bad.format_version = 2,
            "ancestor" => bad.ancestor.archive_sha256[0] ^= 1,
            "local" => bad.local_origin = bad.ancestor.clone(),
            "server" => bad.server.native.manifest[0] ^= 1,
            _ => bad.participants.sha256[0] ^= 1,
        }
        assert!(
            host.verify_selected_recovery_state(
                "owner",
                &owner,
                bad,
                inventory.clone(),
                fixture.source.protected_records()
            )
            .await
            .is_err(),
            "{wrong}"
        );
    }
    let PhysicalServerRoomRecoveryCoverage::Pending { missing } = host
        .verify_selected_recovery_state(
            "owner",
            &owner,
            expected.clone(),
            inventory.clone(),
            RecoveryRegistrationCredentials { documents: vec![], reviews: vec![] },
        )
        .await?
    else {
        return Err("missing secrets produced a proof".into());
    };
    assert_eq!(missing.len(), 6);
    let old = serde_json::json!({"origin":expected.local_origin,"server":expected.server,"participants":expected.participants});
    assert!(serde_json::from_value::<PhysicalServerRoomRecoveryStateIdentity>(old).is_err());
    assert_eq!(host.capture_recovery_state("owner", &owner).await?.identity()?, expected);
    Ok(())
}
