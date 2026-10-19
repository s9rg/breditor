//! Include the exclusively held effect author's conservative native history without authoring.
use super::Room;
use crate::Result;
use breditor_collab_feasibility::rich_replica::VersionAssetReference;
impl Room {
    pub(in crate::room) fn retained_effect_asset_references(
        &self,
    ) -> Result<Vec<VersionAssetReference>> {
        let Some(state) = &self.suggestions else {
            return Ok(Vec::new());
        };
        let observed = state.effect_owner.observe()?;
        Ok(state
            .effect_owner
            .retained_asset_references_guarded(&observed)?
            .into_iter()
            .map(|r| VersionAssetReference {
                asset: r.asset().as_str().into(),
                generation: r.generation().as_str().into(),
            })
            .collect())
    }
}
