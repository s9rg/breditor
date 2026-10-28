//! Two complete reads bracket encoding; final native comparison follows every provider callback.
use super::{
    report::Read,
    request::{MAX_BYTES, Request},
    resolve::resolve,
};
use crate::{
    Error, Result,
    server::generation_recovery::{control::lease::State, selected::check_selected},
};
use axum::body::Bytes;
use std::sync::Arc;

async fn capture(
    state: Arc<State>,
    request: Arc<Request>,
    digest: String,
) -> Result<(Read, Vec<u8>)> {
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
        let read = resolve(&state, &assets, &request, &digest, state.provider.as_ref())?;
        let bytes = serde_json::to_vec(&read)?;
        if bytes.len() > MAX_BYTES {
            return Err(Error::Contract("generation asset complete response budget"));
        }
        // All callbacks and pure serialization precede the final actual selected-source check.
        check(room, &mut assets)?;
        state.local()?;
        Ok((read, bytes))
    })
    .await
}
pub(in crate::server) async fn read(state: Arc<State>, body: Bytes) -> Result<Vec<u8>> {
    state.local()?;
    let request: Request = serde_json::from_slice(&body)?;
    request.validate(&state.selection)?;
    let digest = crate::assets::asset_id(&body)
        .strip_prefix("sha256:")
        .ok_or(Error::Contract("generation asset request digest"))?
        .to_owned();
    state.check().await?;
    let request = Arc::new(request);
    let (before, bytes) = capture(state.clone(), request.clone(), digest.clone()).await?;
    let (after, _) = capture(state.clone(), request, digest).await?;
    if before != after {
        return Err(Error::Contract("generation complete asset mapping or bytes changed"));
    }
    state.local()?;
    Ok(bytes)
}
