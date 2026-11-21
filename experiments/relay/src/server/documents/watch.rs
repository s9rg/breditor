//! Off-hot-path room observers that turn coalesced change notifications into webhook events.
//! They subscribe to the same watch channels as sockets, debounce, and read under the room lock
//! only after the debounce interval; a slow or failing receiver never reaches this task.
use super::{super::Host, webhooks::Webhooks};
use breditor_collab_feasibility::review::{ReviewThreadState, ReviewThreadView};
use serde_json::json;
use std::{
    collections::{BTreeMap, BTreeSet},
    time::Duration,
};
use tokio::sync::watch;

#[derive(Default)]
struct Thread {
    resolved: bool,
    messages: BTreeSet<String>,
}
fn id(value: &impl serde::Serialize) -> String {
    serde_json::to_value(value).ok().and_then(|v| v.as_str().map(String::from)).unwrap_or_default()
}
fn index(views: Option<Vec<ReviewThreadView>>) -> BTreeMap<String, Thread> {
    views
        .unwrap_or_default()
        .into_iter()
        .map(|thread| {
            (
                id(&thread.id),
                Thread {
                    resolved: thread.state == ReviewThreadState::Resolved,
                    messages: thread.messages.iter().map(|m| id(&m.id)).collect(),
                },
            )
        })
        .collect()
}
async fn threads(host: &Host) -> Option<Vec<ReviewThreadView>> {
    host.transaction(|room| room.review_thread_views()).await.ok().flatten()
}
fn diff(
    room: &str,
    webhooks: &Webhooks,
    before: &BTreeMap<String, Thread>,
    views: Option<Vec<ReviewThreadView>>,
) -> BTreeMap<String, Thread> {
    let authors: BTreeMap<String, String> = views
        .iter()
        .flatten()
        .flat_map(|t| t.messages.iter().map(|m| (id(&m.id), id(&m.author))))
        .collect();
    let after = index(views);
    for (thread, state) in &after {
        let old = before.get(thread);
        for message in &state.messages {
            if old.is_none_or(|old| !old.messages.contains(message)) {
                let _ = webhooks.emit(
                    "comment.created",
                    room,
                    &json!({"threadId":thread,"messageId":message,
                        "author":authors.get(message),"threadCreated":old.is_none()}),
                );
            }
        }
        if state.resolved && old.is_none_or(|old| !old.resolved) {
            let _ = webhooks.emit("comment.resolved", room, &json!({"threadId":thread}));
        }
    }
    after
}

pub(super) fn spawn(
    room: String,
    host: Host,
    webhooks: Webhooks,
    debounce: Duration,
    mut stop: watch::Receiver<bool>,
) {
    let documents = webhooks.wants("document.changed");
    let comments = webhooks.wants("comment.created") || webhooks.wants("comment.resolved");
    if !documents && !comments {
        return;
    }
    tokio::spawn(async move {
        let mut changed = host.changed.subscribe();
        let mut review = host.review_changed.subscribe();
        let mut revision = host.transaction(|room| room.document_revision()).await.ok();
        let mut known = index(threads(&host).await);
        loop {
            tokio::select! {
                _ = stop.changed() => break,
                update = changed.changed(), if documents => {
                    if update.is_err() { break; }
                    tokio::select! {
                        _ = stop.changed() => break,
                        () = tokio::time::sleep(debounce) => {}
                    }
                    changed.borrow_and_update();
                    let current = host.transaction(|room| room.document_revision()).await.ok();
                    if current.is_some() && current != revision {
                        let _ = webhooks.emit("document.changed", &room, &json!({"revision":current}));
                        revision = current;
                    }
                }
                update = review.changed(), if comments => {
                    if update.is_err() { break; }
                    review.borrow_and_update();
                    known = diff(&room, &webhooks, &known, threads(&host).await);
                }
            }
        }
    });
}
