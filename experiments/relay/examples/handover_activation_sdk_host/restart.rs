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
    RecoveryRegistrationCredentials, ServerLogGenerationRoomBackup,
    assets::asset_id,
    server::{
        NativeGenerationActivationCheckpointStatus as Status,
        NativeGenerationActivationPrepareOptions, PreparedNativeGenerationActivationIdentity,
        ReopenedSealedNativeRestartHost, SealedNativeRestartBootstrap,
        SealedNativeRestartBootstrapCoverage, ServerLogGenerationRecoveryStateIdentity,
        prepare_durable_native_activation_control, reopen_sealed_native_restart_host,
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
#[path = "restart_inspection.rs"]
mod inspection;
pub(super) use inspection::inspect;

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

    fn inspected(&self) -> bool {
        self.format == "breditor/private-native-sealed-inspected-process-recovery"
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
    let published = input.published() || input.inspected();
    if (!published && input.format != "breditor/private-native-sealed-process-recovery")
        || input.format_version != 1
        || published != input.expected_published.is_some()
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

struct ReopenedTarget {
    original: ServerLogGenerationRoomBackup,
    recovered: ReopenedSealedNativeRestartHost,
    protected: RecoveryRegistrationCredentials,
    owner_token: String,
    alice_token: String,
}

async fn reopen_target(
    input: &Bootstrap,
    sealed: &Path,
    retained: &ServerLogGenerationRoomBackup,
) -> Result<ReopenedTarget> {
    let checkpoint_root = sealed.join(&input.checkpoint_name);
    let raw = read_pinned(&checkpoint_root.join("activation.json"), &input.checkpoint_digest)?;
    let expected_checkpoint: PreparedNativeGenerationActivationIdentity =
        serde_json::from_slice(&raw)?;
    let accounts = authentication::accounts()?;
    if accounts.alice == input.old_alice_token {
        return Err("sealed restart requires fresh accounts".into());
    }
    let protected = input.protected.admit()?;
    let checkpoint = expected_checkpoint.current();
    let expected_current = match &input.expected_published {
        Some(expected) => {
            let previous = retained.info()?.identity;
            if expected.server == checkpoint.server {
                return Err("selected published cut must advance beyond its checkpoint".into());
            }
            if input.inspected() {
                if expected.server == previous {
                    return Err(
                        "cold inspection must advance beyond its retained predecessor".into()
                    );
                }
            } else if expected.server != previous {
                return Err("retained published cut differs".into());
            }
            expected.clone()
        }
        None => checkpoint.clone(),
    };
    let SealedNativeRestartBootstrapCoverage::Verified(recovered) =
        Box::pin(reopen_sealed_native_restart_host(
            SealedNativeRestartBootstrap {
                source_root: sealed.join("intent"),
                checkpoint_root,
                authority_root: input.root.join("authority"),
                operational_root: sealed.join("target"),
                expected_checkpoint,
                expected_current,
            },
            accounts.authentication,
            "owner",
            &accounts.owner,
            credentials::proof_inputs(&protected),
        ))
        .await?
    else {
        return Err("complete original registrations required".into());
    };
    let original = ServerLogGenerationRoomBackup::from_owned_bytes(
        recovered.source.source_backup().to_bytes()?,
    )?;
    Ok(ReopenedTarget {
        original,
        recovered,
        protected,
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
    let sealed = input.root.join("sdk-handover");
    let retained = read_observed_cuts(&input)?;
    let ReopenedTarget { original, recovered, protected, owner_token, alice_token } =
        Box::pin(reopen_target(&input, &sealed, &retained.previous)).await?;
    let ReopenedSealedNativeRestartHost { host, proof, source, checkpoint, authority, status } =
        recovered;
    let checkpoint = if status == Status::Committed {
        Arc::new(
            host.prepare_durable_native_restart(
                "owner",
                &owner_token,
                checkpoint,
                &proof,
                NativeGenerationActivationPrepareOptions {
                    root: sealed.join(format!("restart-checkpoint-{}", input.next_sequence)),
                    authority: authority.clone(),
                },
            )
            .await?,
        )
    } else {
        checkpoint
    };
    let RetainedCuts { spec, fixture, successor, earlier, initial_snapshot, previous, older } =
        retained;
    let (operators, token) = authentication::operator()?;
    let (router, control) = prepare_durable_native_activation_control(
        host.clone(),
        Arc::new(proof),
        checkpoint.clone(),
        authority.clone(),
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
            intent: source,
            authority,
        }),
    };
    publication_action::provision(&mut state).await?;
    Ok(state)
}
