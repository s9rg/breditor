//! Explicit epoch-pinned native provider guards; canonical images are never remapped.
use super::super::super::source::TestResult;
use super::fixture::raster;
use crate::{Error, assets::asset_id, server::ServerRecoveryAssetProvider};
use breditor_collab_feasibility::rich_replica::VersionAssetReference;
use std::{
    collections::BTreeMap,
    sync::{Arc, Mutex},
};

pub(super) struct Mapping {
    pub allowed: bool,
    pub epoch: u64,
    pub pairs: BTreeMap<(String, String), String>,
    pub calls: usize,
    pub flip_on: Option<usize>,
    pub flip_target: String,
}
struct Guard {
    state: Arc<Mutex<Mapping>>,
    epoch: u64,
}
impl ServerRecoveryAssetProvider for Guard {
    fn check(&self) -> crate::Result<()> {
        let state = self.state.lock().map_err(|_| Error::NeedsRecovery)?;
        if !state.allowed || state.epoch != self.epoch {
            return Err(Error::Permission);
        }
        Ok(())
    }
    fn resolve(&self, reference: &VersionAssetReference) -> crate::Result<Option<String>> {
        let mut state = self.state.lock().map_err(|_| Error::NeedsRecovery)?;
        let key = (reference.asset.clone(), reference.generation.clone());
        let value = state.pairs.get(&key).cloned();
        state.calls += 1;
        if state.flip_on == Some(state.calls) {
            let target = state.flip_target.clone();
            state.pairs.insert(key, target);
        }
        Ok(value)
    }
}
pub(super) fn mappings() -> TestResult<Arc<Mutex<Mapping>>> {
    let content = asset_id(&raster(image::ImageFormat::Png)?);
    Ok(Arc::new(Mutex::new(Mapping {
        allowed: true,
        epoch: 1,
        calls: 0,
        flip_on: None,
        flip_target: asset_id(&raster(image::ImageFormat::Jpeg)?),
        pairs: BTreeMap::from([
            (("asset".into(), "generation".into()), content.clone()),
            (("asset".into(), "provider-current".into()), content),
        ]),
    })))
}
pub(super) fn provider(
    state: &Arc<Mutex<Mapping>>,
) -> TestResult<Arc<dyn ServerRecoveryAssetProvider>> {
    let epoch = state.lock().map_err(|_| "mapping guard")?.epoch;
    Ok(Arc::new(Guard { state: state.clone(), epoch }))
}
