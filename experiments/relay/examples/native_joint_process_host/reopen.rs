//! Reacquire the actual target, then provision two new authenticated barriers.
//! A prepared checkpoint keeps its epoch. A committed checkpoint creates a child
//! epoch. Neither path revives an old publication receipt or opens normal routes.
use super::{
    Result, bootstrap, observed, prepare_publication_action, reacquire, restore_ready, service,
    state::{Offer, State},
    storage,
};
use breditor_collab_relay::server::NativeGenerationActivationCheckpointStatus as Status;
use sha2::{Digest, Sha256};
pub(super) async fn start() -> Result<State> {
    let input = bootstrap::read_joint()?;
    let observed = observed::read(&input)?;
    let reacquired = Box::pin(reacquire::apply(input)).await?;
    let restore_ready::Restored { input, ready, router, token, selection, identity, status } =
        restore_ready::apply(reacquired, &observed)?;
    // Verify the real Rust identity before projecting any observation to JS.
    // Filesystem witnesses may exceed the JavaScript safe-integer range.
    if status == Status::Committed {
        let parent: [u8; 32] = Sha256::digest(serde_json::to_vec(&identity)?).into();
        if serde_json::to_value(ready.checkpoint.identity())?["parent"]
            != serde_json::to_value(parent)?
        {
            return Err("fresh checkpoint must retain the selected committed parent".into());
        }
    } else if ready.checkpoint.identity() != &identity {
        return Err("prepared restart must reopen the exact selected checkpoint".into());
    }
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
    let endpoint =
        format!("http://{}/recovery/native-activation/v1/commit", listener.local_addr()?);
    let observation = serde_json::json!({
        "format":"breditor/native-joint-process-recovery-observation","formatVersion":1,
        "processId":std::process::id(),
        "previousCheckpointStatus":if status==Status::Committed{"committed"}else{"prepared"},
        "oldSelection":identity.planned_selection(),"freshSelection":selection,
        "actualSameTargetReacquired":true,"freshAccountAuthentication":true,
        "allProtectedRegistrationsVerified":true,"nativeServiceStillInactive":true,
        "checkpointParentVerifiedInRust":true,
        "wholeRoomActivated":false,
    });
    storage::write_new(
        &input.root.join(format!("native-joint-process-reopen-{}.json", input.next_sequence)),
        &serde_json::to_vec(&observation)?,
    )?;
    let previous = Some((
        input.previous_sequence,
        observed.get(&input.previous_sequence).ok_or("selected complete predecessor")?.clone(),
    ));
    let mut state = State {
        ready: Some(ready),
        client_address: input.client_address,
        retired_address: input.retired_address,
        tasks: vec![service::start(router, listener)],
        controls: Vec::new(),
        inspections: Vec::new(),
        observed,
        sequence: input.next_sequence,
        previous,
        serving: false,
        offer: Some(Offer { selection: serde_json::to_value(selection)?, endpoint, token }),
        publication_offer: None,
        publications: Vec::new(),
    };
    if !prepare_publication_action::provision(&mut state, input.next_sequence).await? {
        return Err("actual reopened publication control missing".into());
    }
    Ok(state)
}
