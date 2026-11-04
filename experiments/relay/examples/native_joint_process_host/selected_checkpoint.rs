//! Read-back of the actual immutable checkpoint selected by this fixture owner.
//! This reference is DATA for a later private bootstrap, never serving authority.
use super::{Result, state::State, storage};
pub(super) fn retain(state: &State) -> Result {
    let ready = state.ready()?;
    let checkpoint = &ready.checkpoint;
    if checkpoint.root().parent() != Some(ready.root.as_path()) {
        return Err("actual selected checkpoint must belong to this fixture root".into());
    }
    let name = checkpoint.root().file_name().and_then(|n| n.to_str()).ok_or("checkpoint name")?;
    let raw = std::fs::read(checkpoint.root().join("activation.json"))?;
    if raw != serde_json::to_vec(checkpoint.identity())? {
        return Err("actual selected raw checkpoint identity differs".into());
    }
    let reference = serde_json::json!({
        "format":"breditor/test-native-joint-checkpoint-reference","formatVersion":1,
        "checkpointName":name,"bytes":raw.len(),
        "sha256":breditor_collab_relay::assets::asset_id(&raw),
    });
    storage::write_new(
        &ready.root.join(format!("native-joint-selected-checkpoint-{}.json", state.sequence)),
        &serde_json::to_vec(&reference)?,
    )
}
