//! Public-only durable target preparation and fresh cold service recovery.
use super::{TestResult, authentication, author::Author, credentials};
use breditor_collab_relay::{
    OperationalLogGenerationServerRoom, RoomRecoveryPolicy, ServerLogGenerationRoomBackup,
    server::{
        ActivatedNativeLogGenerationHost, NativeGenerationActivationPrepareOptions as Options,
        NativeLogGenerationActivationIdentity, PreparedLogGenerationHandover,
        PreparedLogGenerationHandoverIdentity, PreparedLogGenerationRecoveryHost,
        PreparedNativeGenerationActivation, PreparedNativeGenerationActivationIdentity,
        RoomDeploymentAuthority, ServerLogGenerationRecoveryCoverage,
        VerifiedServerLogGenerationRecoveryState, prepare_log_generation_recovery_host,
    },
};
use std::{fs, path::Path, sync::Arc};
pub(super) async fn first(
    host: &PreparedLogGenerationRecoveryHost,
    token: &str,
    authority: &RoomDeploymentAuthority,
    source: Arc<PreparedLogGenerationHandover>,
    proof: VerifiedServerLogGenerationRecoveryState,
    root: &Path,
    checkpointed: bool,
) -> TestResult<ActivatedNativeLogGenerationHost> {
    if checkpointed {
        let prepared = Arc::new(
            host.prepare_durable_native_activation(
                "owner",
                token,
                source,
                &proof,
                Options { root: root.join("native-checkpoint-one"), authority: authority.clone() },
            )
            .await?,
        );
        fs::write(
            root.join("native-checkpoint-choice.json"),
            serde_json::to_vec(prepared.identity())?,
        )?;
        let selected: PreparedNativeGenerationActivationIdentity =
            serde_json::from_slice(&fs::read(root.join("native-checkpoint-choice.json"))?)?;
        Ok(host
            .activate_durable_native_service(
                "owner",
                token,
                authority.clone(),
                prepared,
                proof,
                selected,
            )
            .await?)
    } else {
        let choice = host
            .preview_native_service_activation("owner", token, authority, &source, &proof)
            .await?;
        fs::write(root.join("activation-choice.json"), serde_json::to_vec(&choice)?)?;
        let choice: NativeLogGenerationActivationIdentity =
            serde_json::from_slice(&fs::read(root.join("activation-choice.json"))?)?;
        Ok(host
            .activate_native_service("owner", token, authority.clone(), source, proof, choice)
            .await?)
    }
}
pub(super) async fn restart(
    root: &Path,
    original: &ServerLogGenerationRoomBackup,
    author: &Author,
) -> TestResult<(ActivatedNativeLogGenerationHost, String)> {
    let document = author.document.checkpoint()?;
    let comments = author.review.checkpoint_json()?;
    let source_id: PreparedLogGenerationHandoverIdentity =
        serde_json::from_slice(&fs::read(root.join("source-choice.json"))?)?;
    let source = Arc::new(PreparedLogGenerationHandover::open(&root.join("intent"), &source_id)?);
    let id: PreparedNativeGenerationActivationIdentity =
        serde_json::from_slice(&fs::read(root.join("native-checkpoint-choice.json"))?)?;
    let prior = Arc::new(PreparedNativeGenerationActivation::open(
        &root.join("native-checkpoint-one"),
        &id,
        source,
    )?);
    let authority =
        RoomDeploymentAuthority::open_at_least(&root.join("authority"), id.planned_selection())?;
    let operation = OperationalLogGenerationServerRoom::resume(
        &root.join("target"),
        original,
        &original.info()?.identity,
        RoomRecoveryPolicy::HostReacquired,
        "owner",
    )?;
    let (auth, token) = authentication()?;
    let host = Box::pin(prepare_log_generation_recovery_host(
        operation,
        auth,
        ServerLogGenerationRoomBackup::from_owned_bytes(original.to_bytes()?)?,
        &original.info()?.identity,
        "owner",
        &token,
    ))
    .await?;
    let state = host.capture_recovery_state("owner", &token).await?;
    let current = state.identity()?;
    let (_, inventory) = state.into_parts();
    let ServerLogGenerationRecoveryCoverage::Verified(proof) = host
        .verify_selected_recovery_state("owner", &token, current, inventory, credentials(author))
        .await?
    else {
        return Err("fresh current credentials missing".into());
    };
    let next = Arc::new(
        host.prepare_durable_native_restart(
            "owner",
            &token,
            prior,
            &proof,
            Options { root: root.join("native-checkpoint-two"), authority: authority.clone() },
        )
        .await?,
    );
    let choice = next.identity().clone();
    assert_ne!(choice.planned_selection(), id.planned_selection());
    fs::write(root.join("native-checkpoint-two-choice.json"), serde_json::to_vec(&choice)?)?;
    let active = host
        .activate_durable_native_service("owner", &token, authority, next, proof, choice)
        .await?;
    assert_eq!(author.document.checkpoint()?, document);
    assert_eq!(author.review.checkpoint_json()?, comments);
    Ok((active, token))
}
