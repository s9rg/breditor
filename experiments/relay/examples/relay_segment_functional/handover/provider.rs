//! A host-selected mapping for the real SDK archive fixture.
use super::Result;
use breditor_collab_feasibility::rich_replica::VersionAssetReference;
use breditor_collab_relay::{
    Error, RecoveredRelaySegmentRoom, RecoveryRegistrationCredentials,
    server::{
        Authentication, ContentAddressedServerAssets, RelaySegmentHandoverInputCoverage,
        ServerAssetAvailabilityMissing, ServerRecoveryAssetProvider,
    },
};
use serde::Deserialize;
use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Selection {
    asset: String,
    generation: String,
    selected_content: String,
    different_content: String,
}

pub(super) struct Provider {
    selection: Selection,
    selected: AtomicBool,
}

impl Provider {
    pub(super) fn prepare(
        selection: Selection,
        target: &mut RecoveredRelaySegmentRoom,
        authentication: &Authentication,
        token: &str,
        credentials: &RecoveryRegistrationCredentials,
    ) -> Result<Arc<Self>> {
        let unmapped: Arc<dyn ServerRecoveryAssetProvider> = Arc::new(ContentAddressedServerAssets);
        let RelaySegmentHandoverInputCoverage::Pending(report) = target.verify_handover_inputs(
            authentication,
            "owner",
            token,
            credentials,
            &unmapped,
        )?
        else {
            return Err("an archive declaration supplied its own provider authority".into());
        };
        assert!(report.missing_registrations.is_empty());
        assert_eq!(
            report.missing_assets,
            [ServerAssetAvailabilityMissing::Mapping {
                reference: VersionAssetReference {
                    asset: selection.asset.clone(),
                    generation: selection.generation.clone(),
                },
            }]
        );

        // The other content is also an authentic existing server raster. This refusal must
        // come from the generation-exact binding rather than a missing or damaged raster.
        let provider = Arc::new(Self { selection, selected: AtomicBool::new(false) });
        let alternate: Arc<dyn ServerRecoveryAssetProvider> = provider.clone();
        if !Self::is_disagreement(&target.verify_handover_inputs(
            authentication,
            "owner",
            token,
            credentials,
            &alternate,
        )) {
            return Err("a different valid raster was accepted for the archived binding".into());
        }
        provider.select(true);
        Ok(provider)
    }

    pub(super) fn is_disagreement<T>(result: &std::result::Result<T, Error>) -> bool {
        matches!(
            result,
            Err(Error::Contract("participant archive and live raster mapping disagree"))
        )
    }

    pub(super) fn select(&self, selected: bool) {
        self.selected.store(selected, Ordering::Release);
    }
}

impl ServerRecoveryAssetProvider for Provider {
    fn check(&self) -> std::result::Result<(), Error> {
        Ok(())
    }

    fn resolve(
        &self,
        reference: &VersionAssetReference,
    ) -> std::result::Result<Option<String>, Error> {
        let mapping = &self.selection;
        if reference.asset != mapping.asset || reference.generation != mapping.generation {
            return Ok(None);
        }
        Ok(Some(
            if self.selected.load(Ordering::Acquire) {
                &mapping.selected_content
            } else {
                &mapping.different_content
            }
            .clone(),
        ))
    }
}
