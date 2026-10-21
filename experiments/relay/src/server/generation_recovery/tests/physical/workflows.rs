//! Separate A/B/C selections retain real native ownership and every independent history family.
use super::super::source::{POLICY, TestResult};
use super::{fixture::PhysicalSource, history::continue_history};
use crate::{
    OperationalLogGenerationServerRoom,
    server::{PhysicalServerRoomRecoveryCoverage, prepare_physical_room_recovery_host},
};
async fn workflow(profile: (u32, bool), atomic: bool, document: bool, review: bool) -> TestResult {
    let fixture = PhysicalSource::new(profile, atomic, document, review)?;
    let (local, owner, _) = fixture.local_host("local-b").await?;
    let local_state = local.capture_recovery_state("owner", &owner).await?.identity()?;
    assert_eq!(local_state.origin, fixture.local.info()?.identity);
    assert_ne!(local_state.origin, fixture.source.original.info()?.identity);
    let host = prepare_physical_room_recovery_host(
        local,
        fixture.source.original_copy()?,
        &fixture.source.original.info()?.identity,
        &fixture.local.info()?.identity,
        "owner",
        &owner,
    )
    .await?;
    let state = host.capture_recovery_state("owner", &owner).await?;
    let expected = state.identity()?;
    assert_eq!(expected.ancestor, fixture.source.original.info()?.identity);
    assert_eq!(expected.local_origin, fixture.local.info()?.identity);
    assert_eq!(expected.server, fixture.local.info()?.identity);
    assert_eq!(expected.participants.source, expected.server.native);
    let (backup, inventory) = state.into_parts();
    assert_eq!(backup.to_bytes()?, fixture.local.to_bytes()?);
    let PhysicalServerRoomRecoveryCoverage::Verified(proof) = host
        .verify_selected_recovery_state(
            "owner",
            &owner,
            expected,
            inventory,
            fixture.source.protected_records(),
        )
        .await?
    else {
        return Err("missing protected inputs".into());
    };
    proof.check_live(&host, "owner", &owner).await?;
    drop(host);
    let root = fixture.source.directory.0.join("local-b");
    assert!(
        OperationalLogGenerationServerRoom::resume(
            &root,
            &fixture.source.original,
            &fixture.source.original.info()?.identity,
            POLICY,
            "owner"
        )
        .is_err()
    );
    let mut operation = OperationalLogGenerationServerRoom::resume(
        &root,
        &fixture.local,
        &fixture.local.info()?.identity,
        POLICY,
        "owner",
    )?;
    continue_history(&mut operation, &fixture.local, &fixture.source, atomic)?;
    Ok(())
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn forty_independent_native_families_keep_ancestor_local_origin_and_future_history_distinct()
-> TestResult {
    let mut count = 0;
    for profile in [(1, false), (2, false), (2, true), (3, false), (3, true)] {
        for atomic in [false, true] {
            for document in [false, true] {
                for review in [false, true] {
                    Box::pin(workflow(profile, atomic, document, review)).await?;
                    count += 1;
                }
            }
        }
    }
    assert_eq!(count, 40);
    Ok(())
}
