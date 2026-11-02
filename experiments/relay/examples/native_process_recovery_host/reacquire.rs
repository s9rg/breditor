//! Reacquire the same actual target, fresh accounts and every original registration.
use super::{Result, authentication, bootstrap::Bootstrap, checkpoint, credentials};
use breditor_collab_relay::{
    OperationalLogGenerationServerRoom, RecoveryRegistrationCredentials, RoomRecoveryPolicy,
    ServerLogGenerationRoomBackup,
    server::{
        DurableNativeActivationControl, NativeGenerationActivationCheckpointStatus as Status,
        NativeGenerationActivationPrepareOptions, PreparedLogGenerationRecoveryHost,
        PreparedNativeGenerationActivation, PreparedNativeGenerationActivationIdentity,
        prepare_durable_native_activation_control, prepare_log_generation_recovery_host,
    },
};
use std::sync::Arc;
pub(super) struct Reacquired {
    pub input: Bootstrap,
    pub identity: PreparedNativeGenerationActivationIdentity,
    pub status: Status,
    pub original: ServerLogGenerationRoomBackup,
    pub checkpoint: Arc<PreparedNativeGenerationActivation>,
    pub host: PreparedLogGenerationRecoveryHost,
    pub control: DurableNativeActivationControl,
    pub router: axum::Router,
    pub token: String,
    pub protected: RecoveryRegistrationCredentials,
    pub owner: String,
    pub alice: String,
}
pub(super) async fn apply(input: Bootstrap) -> Result<Reacquired> {
    let checkpoint::Selected { identity, checkpoint, authority, status, original } =
        checkpoint::open(&input)?;
    let operation = OperationalLogGenerationServerRoom::resume(
        &input.root.join("target"),
        &original,
        &original.info()?.identity,
        RoomRecoveryPolicy::HostReacquired,
        "owner",
    )?;
    let account = authentication::accounts()?;
    if account.alice == input.old_alice_token {
        return Err("new process must provision fresh accounts".into());
    }
    let host = prepare_log_generation_recovery_host(
        operation,
        account.authentication,
        ServerLogGenerationRoomBackup::from_owned_bytes(original.to_bytes()?)?,
        &original.info()?.identity,
        "owner",
        &account.owner,
    )
    .await?;
    let protected = input.protected.admit()?;
    let proof = credentials::verify(&host, &account.owner, &protected).await?;
    // Saved intent/receipt data supplied neither this native proof nor current target custody.
    if proof.identity() != *identity.current() {
        return Err(
            "actual target advanced beyond the independently selected process checkpoint".into()
        );
    }
    let checkpoint = if status == Status::Committed {
        Arc::new(
            host.prepare_durable_native_restart(
                "owner",
                &account.owner,
                checkpoint,
                &proof,
                NativeGenerationActivationPrepareOptions {
                    root: input
                        .root
                        .join(format!("process-native-checkpoint-{}", input.next_sequence)),
                    authority: authority.clone(),
                },
            )
            .await?,
        )
    } else {
        checkpoint
    };
    let (operators, token) = authentication::operator()?;
    let (router, control) = prepare_durable_native_activation_control(
        host.clone(),
        Arc::new(proof),
        checkpoint.clone(),
        authority,
        "owner",
        &account.owner,
        operators,
    )
    .await?;
    Ok(Reacquired {
        input,
        identity,
        status,
        original,
        checkpoint,
        host,
        control,
        router,
        token,
        protected,
        owner: account.owner,
        alice: account.alice,
    })
}
