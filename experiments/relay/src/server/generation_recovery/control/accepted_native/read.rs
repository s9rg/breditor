//! Extract server-accepted operations under actual native/asset custody. Never
//! use a client's full offline frame or reconstruct an editor from a report.
use super::{
    report::Read,
    request::{Document, MAX_RESPONSE_BYTES, Request, Review},
};
use crate::{
    Error, Result,
    server::generation_recovery::{control::lease::State, selected::check_selected},
};
use axum::body::Bytes;
use std::sync::Arc;

async fn capture(state: Arc<State>, request: Arc<Request>, digest: String) -> Result<Vec<u8>> {
    let assets = state.host.host.assets.clone().ok_or(Error::NeedsRecovery)?;
    let custody = state.host.host.generation_custody.clone().ok_or(Error::NeedsRecovery)?;
    let host = state.host.host.clone();
    host.transaction(move |room| {
        state.local()?;
        let mut assets = assets.lock().map_err(|_| Error::NeedsRecovery)?;
        let check = |room: &mut crate::Room, assets: &mut crate::assets::AssetStore| {
            check_selected(
                room,
                assets,
                &state.host.original,
                &custody,
                &state.owner,
                &state.selection.source,
            )
        };
        check(room, &mut assets)?;
        let inventory = room.log_generation_participant_inventory(&state.owner)?;
        if inventory.identity() != state.selection.source.participants {
            return Err(Error::Contract("accepted native inventory selection"));
        }
        let review = match (&request.review, inventory.metadata().native.review.is_some()) {
            (Review::Absent {}, false) => None,
            (Review::Start {}, true) => Some(room.review_catchup(&state.owner, None)?),
            (Review::After { cursor }, true) => {
                Some(room.review_catchup(&state.owner, Some(cursor))?)
            }
            _ => return Err(Error::Contract("accepted native review lane selection")),
        };
        let document_frame = match request.document {
            Document::Include => Some(room.catchup(&state.owner)?),
            Document::Omit => None,
        };
        let read = Read {
            format: "breditor/server-log-generation-recovery-accepted-native-read",
            format_version: 1,
            selection: state.selection.clone(),
            request_sha256: digest,
            scope: "selected-server-accepted-native-page",
            document_frame,
            review,
        };
        let bytes = serde_json::to_vec(&read)?;
        if bytes.len() > MAX_RESPONSE_BYTES {
            return Err(Error::Contract("accepted native complete response budget"));
        }
        check(room, &mut assets)?;
        state.local()?;
        Ok(bytes)
    })
    .await
}

pub(in crate::server) async fn read(state: Arc<State>, body: Bytes) -> Result<Vec<u8>> {
    state.local()?;
    let request: Request = serde_json::from_slice(&body)?;
    request.validate(&state.selection)?;
    let digest = crate::assets::asset_id(&body)
        .strip_prefix("sha256:")
        .ok_or(Error::Contract("accepted native request digest"))?
        .to_owned();
    state.check().await?;
    let bytes = capture(state.clone(), Arc::new(request), digest).await?;
    // The provider callback can change native sources or close this controller.
    // Recheck the exact selected cut after it, never only cached prefix clocks.
    state.check().await?;
    state.local()?;
    Ok(bytes)
}
