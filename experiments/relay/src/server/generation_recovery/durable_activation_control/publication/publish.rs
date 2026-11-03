//! The final installation runs under the actual Native deployment transaction.
use super::{
    NativeRoomPublicationReceipt, NativeRoomPublicationRequest,
    serve::Serving,
    state::{Phase, State},
};
use crate::{Error, Result};
impl State {
    pub(super) fn publish(
        &self,
        request: &NativeRoomPublicationRequest,
        principal: &str,
        token_digest: &[u8; 32],
    ) -> Result<Vec<u8>> {
        self.local()?;
        self.native.state.operators.authenticate_digest(principal, token_digest)?;
        if request.format != "breditor/native-room-publication-request"
            || request.format_version != 1
            || request.selection != self.identity
        {
            return Err(Error::Contract("publication control instance differs"));
        }
        request.joint.check()?;
        self.native.state.with_serving_router(self.connections.clone(), |router| {
            // A test observes this actual deployment-barrier entry without
            // probing the production try_lock mutex or influencing admission.
            #[cfg(test)]
            self.worker_entered.store(true, std::sync::atomic::Ordering::Release);
            let mut held = self.phase.lock().map_err(|_| Error::NeedsRecovery)?;
            self.local()?;
            match &mut *held {
                Phase::Serving { joint, receipt, service } => {
                    if joint != &request.joint {
                        return Err(Error::Contract("publication joint choice differs"));
                    }
                    if !service.running() {
                        return Err(Error::NeedsRecovery);
                    }
                    Ok(receipt.clone())
                }
                Phase::Waiting(listener) => {
                    let selected = listener.as_ref().ok_or(Error::NeedsRecovery)?;
                    if selected.local_addr()?.to_string() != self.identity.listener {
                        return Err(Error::Contract("actual publication listener differs"));
                    }
                    // Register a duplicate descriptor of the SAME bound socket
                    // on the actual operator worker's current live reactor.
                    // Registration failure leaves the original listener held.
                    let runtime =
                        tokio::runtime::Handle::try_current().map_err(|_| Error::NeedsRecovery)?;
                    let socket = tokio::net::TcpListener::from_std(selected.try_clone()?)?;
                    let receipt = serde_json::to_vec(&NativeRoomPublicationReceipt {
                        format: "breditor/native-room-publication-receipt".into(),
                        format_version: 1,
                        selection: self.identity.clone(),
                        joint: request.joint.clone(),
                        scope:
                            "actual-held-native-service-and-bound-listener; joint-association-only"
                                .into(),
                    })?;
                    let joint = request.joint.clone();
                    // No await or application callback after consuming the actual
                    // listener. Both the real task and its close handle are stored
                    // in this already reachable owner before leaving the barrier.
                    drop(listener.take().ok_or(Error::NeedsRecovery)?);
                    let service = Serving::start(&runtime, socket, router, self.native.clone());
                    *held = Phase::Serving { joint, receipt: receipt.clone(), service };
                    Ok(receipt)
                }
            }
        })
    }
}
