//! Engine history carries only an action ID; Breditor owns exact before/after causal UI recipes.
use super::ui_state::UiState;
use loro::{UndoItemMeta, sync::Mutex};
pub(super) use loro_internal::UndoManager;
use std::sync::Arc;

#[derive(Debug, Clone)]
pub(super) struct Recipe {
    pub before: UiState,
    pub after: UiState,
}

#[derive(Default)]
pub(super) struct Channel {
    pub push: UndoItemMeta,
    pub popped: Vec<UndoItemMeta>,
}

pub(super) fn connect(undo: &UndoManager) -> Arc<Mutex<Channel>> {
    let channel = Arc::new(Mutex::new(Channel::default()));
    let push = Arc::clone(&channel);
    let pop = Arc::clone(&channel);
    undo.set_on_push(Some(Box::new(move |_, _, _| push.lock().push.clone())));
    undo.set_on_pop(Some(Box::new(move |_, _, meta| {
        let mut channel = pop.lock();
        channel.push = meta.clone(); // Opposite stack keeps this same action ID, not the current caret.
        channel.popped.push(meta);
    })));
    channel
}
