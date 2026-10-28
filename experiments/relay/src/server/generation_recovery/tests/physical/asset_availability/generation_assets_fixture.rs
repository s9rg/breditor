//! Genuine standalone generation proof over this actual retained local owner, never its ancestor.
use super::{super::super::source::TestResult, fixture::Fixture};
use crate::server::{
    ServerLogGenerationRecoveryCoverage, VerifiedServerLogGenerationRecoveryState,
};
use std::sync::Arc;
pub(super) async fn native(
    fixture: &Fixture,
) -> TestResult<Arc<VerifiedServerLogGenerationRecoveryState>> {
    let host = fixture.local();
    let captured = host.capture_recovery_state("owner", &fixture.owner).await?;
    let expected = captured.identity()?;
    assert_eq!(expected.origin, fixture.expected.local_origin);
    assert_ne!(expected.origin, fixture.expected.ancestor);
    assert_eq!(expected.server, fixture.expected.server);
    let (_, inventory) = captured.into_parts();
    let ServerLogGenerationRecoveryCoverage::Verified(proof) = host
        .verify_selected_recovery_state(
            "owner",
            &fixture.owner,
            expected,
            inventory,
            fixture.credentials(),
        )
        .await?
    else {
        return Err("complete protected generation streams did not verify".into());
    };
    Ok(Arc::new(proof))
}
