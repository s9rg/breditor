//! Actual SDK activation and normal publication use separate authenticated HTTP.
//! Private IPC only provisions controls and observes actual published ownership.
#[path = "joint_restart_host/activate.rs"]
mod activate;
#[path = "selected_delivery_host/authentication.rs"]
mod authentication;
#[path = "joint_restart_host/begin.rs"]
mod begin;
#[path = "complete_cohort_fixture/clients.rs"]
mod clients;
#[path = "selected_delivery_host/credentials.rs"]
mod credentials;
#[path = "selected_delivery_host/full_path.rs"]
mod full_path;
#[path = "selected_delivery_host/inspection.rs"]
mod inspection;
#[path = "native_publication_sdk_host/native_service.rs"]
mod native_service;
#[path = "native_publication_sdk_host/next.rs"]
mod next;
#[path = "native_publication_sdk_host/protocol.rs"]
mod protocol;
#[path = "generation_complete_control/public_inputs.rs"]
mod public_inputs;
#[path = "joint_restart_host/seed.rs"]
mod seed;
#[path = "joint_restart_host/service.rs"]
mod service;
#[path = "native_activation_sdk_host/setup.rs"]
mod setup;
#[path = "selected_delivery_host/snapshot.rs"]
mod snapshot;
#[path = "server_generation_inventory_fixture/source.rs"]
mod source;
#[path = "native_activation_sdk_host/stage.rs"]
mod stage;
#[path = "participant_inventory_fixture/storage.rs"]
mod storage;
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error + Send + Sync>>;

#[path = "native_publication_sdk_host/observe_publication_action.rs"]
mod observe_publication_action;
#[path = "native_activation_sdk_host/prepare_action.rs"]
mod prepare_action;
#[path = "native_publication_sdk_host/prepare_after_action.rs"]
mod prepare_after_action;
#[path = "native_publication_sdk_host/prepare_publication_action.rs"]
mod prepare_publication_action;
#[path = "native_publication_sdk_host/state.rs"]
mod state;
/// Run actual native histories and a separately SDK-committed serving epoch.
/// # Errors
/// Invalid input, stale cuts, missing custody, storage and service faults refuse.
#[tokio::main(worker_threads = 2)]
pub async fn main() -> Result {
    let mut state = state::State::start().await?;
    let mut input = protocol::read();
    'main: loop {
        state.publish().await?;
        loop {
            let action = next::read(
                state.ready.as_ref().ok_or("actual native owner missing")?,
                &mut input,
                &state.observed,
                state.sequence,
                &mut state.inspections,
            )
            .await?;
            let Some(action) = action else {
                break 'main;
            };
            let advanced = match action {
                next::Action::Snapshot { request, previous } => {
                    if state.serving {
                        state.previous = previous;
                        state.sequence = request;
                        true
                    } else {
                        protocol::refuse(request, "finish-the-actual-activation-first")?;
                        false
                    }
                }
                next::Action::PrepareActivation { request, source } => {
                    prepare_action::apply(&mut state, request, &source).await?
                }
                next::Action::PrepareJointActivation { request, source } => {
                    prepare_publication_action::apply(&mut state, request, &source).await?
                }
                next::Action::PrepareJointActivationAfter { request, source, previous } => {
                    prepare_after_action::apply(&mut state, request, &source, previous).await?
                }
                next::Action::ObservePublication { request } => {
                    observe_publication_action::apply(&mut state, request).await?
                }
            };
            if advanced {
                break;
            }
        }
    }
    state.stop_services().await
}
