//! Require all fourteen actual registrations before constructing a live native proof.
use super::Result;
use breditor_collab_relay::{
    RecoveryRegistrationCredentials, ServerLogGenerationParticipantInventory,
    server::{
        PreparedLogGenerationRecoveryHost, ServerLogGenerationRecoveryCoverage,
        ServerLogGenerationRecoveryStateIdentity, VerifiedServerLogGenerationRecoveryState,
    },
};

pub async fn verify(
    host: &PreparedLogGenerationRecoveryHost,
    token: &str,
    selected: ServerLogGenerationRecoveryStateIdentity,
    inventory: ServerLogGenerationParticipantInventory,
    protected: RecoveryRegistrationCredentials,
) -> Result<VerifiedServerLogGenerationRecoveryState> {
    if inventory.metadata().native.writers.len() != 7
        || inventory.metadata().native.review.as_ref().map(|row| row.writers.len()) != Some(7)
    {
        return Err("native seven-writer inventory is incomplete".into());
    }
    let ServerLogGenerationRecoveryCoverage::Pending { missing } = host
        .verify_selected_recovery_state(
            "owner",
            token,
            selected.clone(),
            inventory.clone(),
            RecoveryRegistrationCredentials::default(),
        )
        .await?
    else {
        return Err("missing seven-writer credentials produced native proof".into());
    };
    if missing.len() != 14 {
        return Err("every native document/comment stream must be protected".into());
    }
    let ServerLogGenerationRecoveryCoverage::Verified(proof) =
        host.verify_selected_recovery_state("owner", token, selected, inventory, protected).await?
    else {
        return Err("native protected streams".into());
    };
    Ok(proof)
}
