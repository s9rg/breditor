//! Host-owned test registrations, never Debug/Serialize or public fixture data.
use super::Result;
use breditor_collab_relay::server::{
    PreparedLogGenerationRecoveryHost, ServerLogGenerationRecoveryCoverage,
    VerifiedServerLogGenerationRecoveryState,
};
use breditor_collab_relay::{
    RecoveryDocumentCredential, RecoveryRegistrationCredentials, RecoveryReviewCredential,
};

pub(super) fn proof_inputs(
    source: &RecoveryRegistrationCredentials,
) -> RecoveryRegistrationCredentials {
    RecoveryRegistrationCredentials {
        documents: source
            .documents
            .iter()
            .map(|row| RecoveryDocumentCredential {
                principal: row.principal.clone(),
                writer: row.writer.clone(),
                credential: row.credential.clone(),
            })
            .collect(),
        reviews: source
            .reviews
            .iter()
            .map(|row| RecoveryReviewCredential {
                principal: row.principal.clone(),
                actor: row.actor.clone(),
                credential: row.credential.clone(),
            })
            .collect(),
    }
}
pub(super) async fn verify(
    host: &PreparedLogGenerationRecoveryHost,
    token: &str,
    source: &RecoveryRegistrationCredentials,
) -> Result<VerifiedServerLogGenerationRecoveryState> {
    let state = host.capture_recovery_state("owner", token).await?;
    let expected = state.identity()?;
    let (_, inventory) = state.into_parts();
    match host
        .verify_selected_recovery_state("owner", token, expected, inventory, proof_inputs(source))
        .await?
    {
        ServerLogGenerationRecoveryCoverage::Verified(proof) => Ok(proof),
        ServerLogGenerationRecoveryCoverage::Pending { .. } => {
            Err("complete original registrations required".into())
        }
    }
}
