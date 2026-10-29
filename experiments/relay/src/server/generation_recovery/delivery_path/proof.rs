//! Runtime proof over complete retained files; no native owner or plaintext token retained.
use super::{ServerLogGenerationDeliveryPathIdentity, selected::check_selected};
use crate::server::generation_recovery::{
    PreparedLogGenerationRecoveryHost, VerifiedServerLogGenerationRecoveryState,
};
use crate::{Error, Result, ServerLogGenerationRoomBackup};
use std::sync::Arc;
/// Genuine same-host protected-current proof plus actual A<=B<=C1<=...<=D bytes.
/// No public constructor/serialization, writer grant, ACK, provider closure or activation.
/// Cold hosts require a fresh native proof even when all byte selections match.
/// ```compile_fail
/// use breditor_collab_relay::server::VerifiedServerLogGenerationDeliveryPath;
/// let _:VerifiedServerLogGenerationDeliveryPath=Default::default();
/// ```
/// ```compile_fail
/// use breditor_collab_relay::server::VerifiedServerLogGenerationDeliveryPath;
/// let _:VerifiedServerLogGenerationDeliveryPath=serde_json::from_str("{}").unwrap();
/// ```
pub struct VerifiedServerLogGenerationDeliveryPath {
    pub(super) identity: ServerLogGenerationDeliveryPathIdentity,
    pub(super) current: Arc<VerifiedServerLogGenerationRecoveryState>,
    pub(super) ancestors: Vec<Arc<ServerLogGenerationRoomBackup>>,
}
impl VerifiedServerLogGenerationDeliveryPath {
    /// Detached literal pins, not a portable replay or permission proof.
    #[must_use]
    pub fn identity(&self) -> ServerLogGenerationDeliveryPathIdentity {
        self.identity.clone()
    }
    /// Reauthenticate the actual same owner/host and recheck every complete path
    /// link, current protected inventory, native/raster cut and filesystem custody.
    /// # Errors
    /// Wrong/closed/foreign host, auth, lost old bytes/rasters, stale current native
    /// or raster-only state and storage/custody uncertainty refuse without mutation.
    pub async fn check_live(
        &self,
        handle: &PreparedLogGenerationRecoveryHost,
        principal: &str,
        token: &str,
    ) -> Result<()> {
        handle.host.authentication.authenticate(principal, token)?;
        self.current.check_host(handle, principal)?;
        let assets =
            handle.host.assets.clone().ok_or(Error::Contract("delivery path rasters absent"))?;
        let custody = handle
            .host
            .generation_custody
            .clone()
            .ok_or(Error::Contract("delivery path custody absent"))?;
        let original = handle.original.clone();
        let ancestors = self.ancestors.clone();
        let expected = self.identity.clone();
        let owner = principal.to_owned();
        handle
            .host
            .transaction(move |room| {
                let mut assets = assets.lock().map_err(|_| Error::NeedsRecovery)?;
                check_selected(
                    room,
                    &mut assets,
                    &original,
                    &ancestors,
                    &custody,
                    &owner,
                    &expected,
                )
            })
            .await
    }
}
