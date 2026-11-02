//! Real epoch publication remains inside the existing native attachment barrier.
use super::{
    DurableNativeActivationControlIdentity, Receipt,
    state::{Commit, State},
};
use crate::{
    Error, Result,
    server::{
        ActivatedNativeLogGenerationHost, deployment_fence,
        generation_backup::durable::Interruption,
    },
};

impl State {
    /// Runs only in the owned blocking job, never on the async HTTP I/O thread.
    pub fn commit(&self, selected: &DurableNativeActivationControlIdentity) -> Result<Vec<u8>> {
        self.local()?;
        if selected != &self.selection {
            return Err(Error::Contract("activation control instance or checkpoint differs"));
        }
        self.host
            .host
            .authentication
            .authenticate_digest(&self.owner, &self.native_token_digest)?;
        self.proof.check_host(&self.host, &self.owner)?;
        let mut held = self.commit.lock().map_err(|_| Error::NeedsRecovery)?;
        self.local()?;
        match &*held {
            Commit::Prepared => {
                // Any error from the actual worker requires deliberate recovery,
                // even when no usable lease or HTTP response was returned.
                *held = Commit::Uncertain;
                // Allocate the reachable successor holder before the durable transition.
                let mut active = Box::new(ActivatedNativeLogGenerationHost {
                    host: self.host.clone(),
                    selection: self.prepared.identity().planned_selection().clone(),
                });
                let selection = deployment_fence::activate_durable_native_generation(
                    &self.host,
                    &self.owner,
                    &self.authority,
                    &self.prepared,
                    &self.proof,
                    &Interruption::default(),
                )?;
                active.selection = selection;
                *held = Commit::Active(active);
            }
            Commit::Uncertain => return Err(Error::NeedsRecovery),
            Commit::Active(_) => {}
        }
        let Commit::Active(active) = &*held else {
            return Err(Error::NeedsRecovery);
        };
        if active.selection() != self.prepared.identity().planned_selection() {
            return Err(Error::NeedsRecovery);
        }
        self.prepared.guard()?;
        // A repeat observes the SAME actual live lease. It does not append,
        // reconstruct a service, or turn a saved COMMITTED record into rights.
        active.recovery_host().host.deployment.transaction(|| Ok(()))?;
        Ok(serde_json::to_vec(&Receipt {
            format: "breditor/durable-native-activation-control-receipt",
            format_version: 1,
            selection: &self.selection,
            scope: "actual-held-native-service-only",
        })?)
    }
}
