//! Reopen the selected sealed operation after the fixture process exits.
use super::{
    Result, authentication, credentials,
    native_service::NativeService,
    publication_action, service,
    setup::Ready,
    snapshot::HandoverPrefix,
    source,
    state::{Offer, State},
    storage,
};
use breditor_collab_relay::{
    OperationalLogGenerationServerRoom, RecoveryRegistrationCredentials, RoomRecoveryPolicy,
    ServerLogGenerationRoomBackup,
    assets::asset_id,
    server::{
        LogGenerationHandoverStatus, NativeGenerationActivationCheckpointStatus as Status,
        NativeGenerationActivationPrepareOptions, PreparedLogGenerationHandover,
        PreparedLogGenerationRecoveryHost, PreparedNativeGenerationActivation,
        PreparedNativeGenerationActivationIdentity, RoomDeploymentAuthority,
        SealedNativeRestartSelection, ServerLogGenerationRecoveryCoverage,
        ServerLogGenerationRecoveryStateIdentity, VerifiedServerLogGenerationRecoveryState,
        prepare_durable_native_activation_control, prepare_log_generation_recovery_host,
    },
};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    collections::BTreeMap,
    fs,
    net::SocketAddr,
    path::{Path, PathBuf},
    sync::{Arc, OnceLock},
};

#[path = "../native_process_recovery_host/input.rs"]
mod input;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Cut {
    sequence: u64,
    digest: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Bootstrap {
    format: String,
    format_version: u32,
    root: PathBuf,
    checkpoint_name: String,
    checkpoint_digest: String,
    origin_digest: String,
    older_digest: String,
    handover_sequence: u64,
    next_sequence: u64,
    previous_sequence: u64,
    cuts: Vec<Cut>,
    protected: input::Protected,
    #[serde(default)]
    expected_published: Option<ServerLogGenerationRecoveryStateIdentity>,
    old_alice_token: String,
    client_address: SocketAddr,
    retired_address: SocketAddr,
}

impl Bootstrap {
    fn published(&self) -> bool {
        self.format == "breditor/private-native-sealed-published-process-recovery"
    }
}

fn checkpoint_name(name: &str) -> bool {
    name == "native-checkpoint"
        || name.strip_prefix("restart-checkpoint-").is_some_and(|suffix| {
            !suffix.is_empty()
                && !suffix.starts_with('0')
                && suffix.bytes().all(|byte| byte.is_ascii_digit())
        })
}

/// Record the byte identity of the actual checkpoint paired with this offer.
pub(super) fn retain_checkpoint(ready: &Ready, sequence: u64) -> Result {
    let root = ready.root.join("sdk-handover");
    let checkpoint = &ready.checkpoint;
    let name =
        checkpoint.root().file_name().and_then(|name| name.to_str()).ok_or("checkpoint name")?;
    if checkpoint.root().parent() != Some(root.as_path()) || !checkpoint_name(name) {
        return Err("actual sealed checkpoint namespace required".into());
    }
    let bytes = fs::read(checkpoint.root().join("activation.json"))?;
    if bytes != serde_json::to_vec(checkpoint.identity())? {
        return Err("selected sealed checkpoint bytes differ".into());
    }
    storage::write_new(
        &root.join(format!("selected-checkpoint-{sequence}.json")),
        &serde_json::to_vec(&json!({
            "format":"breditor/test-sealed-checkpoint-reference","formatVersion":1,
            "checkpointName":name,"bytes":bytes.len(),"sha256":asset_id(&bytes),
        }))?,
    )
}

fn read_pinned(path: &Path, digest: &str) -> Result<Vec<u8>> {
    let bytes = fs::read(path)?;
    if asset_id(&bytes) != digest {
        return Err("selected sealed restart bytes differ".into());
    }
    Ok(bytes)
}

fn read_backup(path: &Path, digest: &str) -> Result<Arc<ServerLogGenerationRoomBackup>> {
    Ok(Arc::new(ServerLogGenerationRoomBackup::from_owned_bytes(read_pinned(path, digest)?)?))
}

fn read_bootstrap() -> Result<Bootstrap> {
    let input: Bootstrap = input::read()?;
    if (!input.published() && input.format != "breditor/private-native-sealed-process-recovery")
        || input.format_version != 1
        || input.published() != input.expected_published.is_some()
        || input.root.canonicalize()? != input.root
        || !checkpoint_name(&input.checkpoint_name)
        || input.handover_sequence == 0
        || input.handover_sequence > input.previous_sequence
        || input.previous_sequence >= input.next_sequence
        || input.next_sequence > 9_007_199_254_740_991
        || input.cuts.len() > 128
        || input.cuts.first().map(|row| row.sequence) != Some(0)
        || input.cuts.last().map(|row| row.sequence) != Some(input.previous_sequence)
        || input.cuts.windows(2).any(|pair| pair[0].sequence >= pair[1].sequence)
        || !input.client_address.ip().is_loopback()
        || input.client_address.port() == 0
        || !input.retired_address.ip().is_loopback()
        || input.retired_address.port() == 0
    {
        return Err("private sealed restart bootstrap selection".into());
    }
    Ok(input)
}

struct SelectedCheckpoint {
    root: PathBuf,
    checkpoint: Arc<PreparedNativeGenerationActivation>,
    handover: Arc<PreparedLogGenerationHandover>,
    authority: RoomDeploymentAuthority,
    status: Status,
}

fn open_checkpoint(input: &Bootstrap) -> Result<SelectedCheckpoint> {
    let sealed = input.root.join("sdk-handover");
    let checkpoint_root = sealed.join(&input.checkpoint_name);
    let raw = read_pinned(&checkpoint_root.join("activation.json"), &input.checkpoint_digest)?;
    let identity: PreparedNativeGenerationActivationIdentity = serde_json::from_slice(&raw)?;
    let handover =
        Arc::new(PreparedLogGenerationHandover::open(&sealed.join("intent"), identity.source())?);
    let checkpoint = Arc::new(PreparedNativeGenerationActivation::open(
        &checkpoint_root,
        &identity,
        handover.clone(),
    )?);
    let authority = RoomDeploymentAuthority::open_at_least(
        &input.root.join("authority"),
        identity.previous_selection(),
    )?;
    let status = checkpoint.status(&authority)?;
    let floor = match status {
        Status::Prepared => identity.previous_selection(),
        Status::Committed => identity.planned_selection(),
        Status::Superseded => return Err("select the latest sealed checkpoint".into()),
    };
    if &authority.current_selection()? != floor
        || handover.status(&authority)? != LogGenerationHandoverStatus::Sealed
    {
        return Err("selected sealed restart authority differs".into());
    }
    Ok(SelectedCheckpoint { root: sealed, checkpoint, handover, authority, status })
}

struct ReopenedTarget {
    original: ServerLogGenerationRoomBackup,
    host: PreparedLogGenerationRecoveryHost,
    protected: RecoveryRegistrationCredentials,
    proof: VerifiedServerLogGenerationRecoveryState,
    owner_token: String,
    alice_token: String,
}

async fn reopen_target(
    input: &Bootstrap,
    selected: &SelectedCheckpoint,
    retained: &ServerLogGenerationRoomBackup,
) -> Result<ReopenedTarget> {
    let original = ServerLogGenerationRoomBackup::from_owned_bytes(
        selected.handover.source_backup().to_bytes()?,
    )?;
    let origin_identity = original.info()?.identity;
    let operation = OperationalLogGenerationServerRoom::resume(
        &selected.root.join("target"),
        &original,
        &origin_identity,
        RoomRecoveryPolicy::HostReacquired,
        "owner",
    )?;
    let accounts = authentication::accounts()?;
    if accounts.alice == input.old_alice_token {
        return Err("sealed restart requires fresh accounts".into());
    }
    let host = prepare_log_generation_recovery_host(
        operation,
        accounts.authentication,
        ServerLogGenerationRoomBackup::from_owned_bytes(original.to_bytes()?)?,
        &origin_identity,
        "owner",
        &accounts.owner,
    )
    .await?;
    let protected = input.protected.admit()?;
    let checkpoint = selected.checkpoint.identity().current();
    let expected = match &input.expected_published {
        Some(expected) => {
            if selected.status != Status::Committed
                || expected.server == checkpoint.server
                || expected.server != retained.info()?.identity
            {
                return Err("retained published cut differs".into());
            }
            expected.clone()
        }
        None => checkpoint.clone(),
    };
    let ServerLogGenerationRecoveryCoverage::Verified(proof) = host
        .verify_sealed_native_restart(
            "owner",
            &accounts.owner,
            SealedNativeRestartSelection {
                checkpoint: selected.checkpoint.clone(),
                authority: selected.authority.clone(),
                status: selected.status,
                expected,
            },
            credentials::proof_inputs(&protected),
        )
        .await?
    else {
        return Err("complete original registrations required".into());
    };
    Ok(ReopenedTarget {
        original,
        host,
        protected,
        proof,
        owner_token: accounts.owner,
        alice_token: accounts.alice,
    })
}

struct RetainedCuts {
    spec: source::Spec,
    fixture: Value,
    successor: BTreeMap<u64, Arc<ServerLogGenerationRoomBackup>>,
    earlier: Vec<Arc<ServerLogGenerationRoomBackup>>,
    initial_snapshot: OnceLock<Arc<ServerLogGenerationRoomBackup>>,
    previous: Arc<ServerLogGenerationRoomBackup>,
    older: ServerLogGenerationRoomBackup,
}

fn read_observed_cuts(input: &Bootstrap) -> Result<RetainedCuts> {
    let snapshots = input.root.join("snapshots");
    let first = snapshots.join("cut-0");
    let fixture: Value = serde_json::from_slice(&fs::read(first.join("fixture.json"))?)?;
    if fixture["format"] != "breditor/native-selected-delivery-fixture"
        || fixture["formatVersion"] != 1
    {
        return Err("actual original fixture data required".into());
    }
    let spec = source::Spec {
        language: fixture["language"].as_u64().ok_or("language")?.try_into()?,
        standard: fixture["standard"].as_bool().ok_or("standard")?,
        atomic: fixture["atomic"].as_bool().ok_or("atomic")?,
    };
    let mut observed = BTreeMap::new();
    for cut in &input.cuts {
        let archive = read_backup(
            &snapshots.join(format!("cut-{}", cut.sequence)).join("server-after.backup"),
            &cut.digest,
        )?;
        observed.insert(cut.sequence, archive);
    }
    let successor = observed.split_off(&input.handover_sequence);
    let mut earlier = vec![read_backup(&first.join("server.backup"), &input.origin_digest)?];
    earlier.extend(observed.into_values());
    let initial_snapshot = OnceLock::from(
        successor.get(&input.handover_sequence).ok_or("original sealed serving cut")?.clone(),
    );
    let previous =
        successor.get(&input.previous_sequence).ok_or("selected sealed predecessor")?.clone();
    let older = ServerLogGenerationRoomBackup::from_owned_bytes(read_pinned(
        &first.join("older-server.backup"),
        &input.older_digest,
    )?)?;
    Ok(RetainedCuts { spec, fixture, successor, earlier, initial_snapshot, previous, older })
}

pub(super) async fn start() -> Result<State> {
    let input = read_bootstrap()?;
    let selected = open_checkpoint(&input)?;
    let retained = read_observed_cuts(&input)?;
    let ReopenedTarget { original, host, protected, proof, owner_token, alice_token } =
        Box::pin(reopen_target(&input, &selected, &retained.previous)).await?;
    let checkpoint = if selected.status == Status::Committed {
        Arc::new(
            host.prepare_durable_native_restart(
                "owner",
                &owner_token,
                selected.checkpoint,
                &proof,
                NativeGenerationActivationPrepareOptions {
                    root: selected.root.join(format!("restart-checkpoint-{}", input.next_sequence)),
                    authority: selected.authority.clone(),
                },
            )
            .await?,
        )
    } else {
        selected.checkpoint
    };
    let RetainedCuts { spec, fixture, successor, earlier, initial_snapshot, previous, older } =
        retained;
    let (operators, token) = authentication::operator()?;
    let (router, control) = prepare_durable_native_activation_control(
        host.clone(),
        Arc::new(proof),
        checkpoint.clone(),
        selected.authority.clone(),
        "owner",
        &owner_token,
        operators,
    )
    .await?;
    let selection = serde_json::to_value(control.identity())?;
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
    let endpoint =
        format!("http://{}/recovery/native-activation/v1/commit", listener.local_addr()?);
    let secrets = protected
        .documents
        .iter()
        .map(|row| row.credential.clone())
        .chain(protected.reviews.iter().map(|row| row.credential.clone()))
        .chain([token.clone()])
        .collect();
    let ready = Ready {
        root: input.root,
        spec,
        configuration: fixture["configuration"].as_str().ok_or("configuration")?.to_owned(),
        records: fixture["clients"].clone(),
        protected,
        secrets,
        original,
        older,
        active: NativeService::controlled(host, control),
        checkpoint,
        old_router: axum::Router::new().fallback(|| async { axum::http::StatusCode::GONE }),
        owner_token,
        alice_token,
        old_alice_token: input.old_alice_token,
        initial_snapshot,
    };
    let mut state = State {
        ready: Some(ready),
        client_address: input.client_address,
        retired_address: input.retired_address,
        tasks: vec![service::start(router, listener)],
        controls: Vec::new(),
        inspections: Vec::new(),
        observed: successor,
        sequence: input.next_sequence,
        previous: Some((input.previous_sequence, previous)),
        serving: false,
        offer: Some(Offer { sequence: input.next_sequence, selection, endpoint, token }),
        publication_offer: None,
        publications: Vec::new(),
        handover: Some(HandoverPrefix {
            sequence: input.handover_sequence,
            earlier,
            intent: selected.handover,
            authority: selected.authority,
        }),
    };
    publication_action::provision(&mut state).await?;
    Ok(state)
}
