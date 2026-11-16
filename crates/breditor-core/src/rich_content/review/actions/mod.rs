//! Each user review action has its own closed named request file.
mod create_thread;
mod edit_message;
mod reanchor_thread;
mod redo;
mod reply;
mod retract_message;
mod set_thread_state;
mod undo;
mod validate;
pub use create_thread::CreateReviewThread;
pub use edit_message::EditReviewMessage;
pub use reanchor_thread::ReanchorReviewThread;
pub use reply::ReplyToReviewThread;
pub use retract_message::RetractReviewMessage;
use serde::{Deserialize, Serialize};
pub use set_thread_state::SetReviewThreadState;
pub(super) use validate::validate_action;
/// One original review action, never a rich document edit or an arbitrary HTML command.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", content = "data", rename_all = "snake_case", deny_unknown_fields)]
pub enum ReviewAction {
    /// Create a discussion and its first message under one event identity.
    CreateThread(CreateReviewThread),
    /// Add an independently owned reply.
    Reply(ReplyToReviewThread),
    /// Edit a message with explicit original-author/moderator policy.
    EditMessage(EditReviewMessage),
    /// Retract a message without removing replies or its immutable birth.
    RetractMessage(RetractReviewMessage),
    /// Resolve or reopen using an observed causal register.
    SetThreadState(SetReviewThreadState),
    /// Explicitly move an anchor; concurrent reanchors remain visible.
    ReanchorThread(ReanchorReviewThread),
}
