//! Current owner commits the exact prepared source; uncertainty never revives serving.
use super::{Interruption, PreparedLogGenerationHandover, PreparedLogGenerationHandoverIdentity};
use crate::{
    Error, Result,
    server::{deployment_fence, generation_backup::LogGenerationServerBackupHandle},
};
impl LogGenerationServerBackupHandle {
    /// Reauthenticate, recheck actual immutable prepared files and entire live source,
    /// then append exactly its source-bound planned epoch under the real exclusive
    /// permit. No replacement lease, router, client ACK or provider decision is returned.
    /// The object retains durable DATA; status resolves an interrupted result using
    /// independently configured actual authority. Existing methods retain their meaning.
    /// A started blocking worker survives cancellation. Preserve files and the outside
    /// identity on any error; an epoch may already be durable and cannot be rolled back.
    /// # Errors
    /// Wrong current auth/owner/choice, stale data or epoch, busy/changed custody or uncertain I/O refuse.
    pub async fn seal_prepared_handover(
        &self,
        principal: &str,
        token: &str,
        prepared: PreparedLogGenerationHandover,
        expected: &PreparedLogGenerationHandoverIdentity,
    ) -> Result<PreparedLogGenerationHandover> {
        self.host.authentication.authenticate(principal, token)?;
        if prepared.identity() != expected {
            return Err(Error::Contract("prepared handover selected intent differs"));
        }
        let host = self.host.clone();
        let principal = principal.to_owned();
        tokio::task::spawn_blocking(move || {
            deployment_fence::seal_prepared(
                &host,
                &principal,
                &prepared,
                &Interruption::default(),
            )?;
            Ok(prepared)
        })
        .await
        .map_err(|_| Error::NeedsRecovery)?
    }
}
