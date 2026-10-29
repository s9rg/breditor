//! The ACTUAL read job owns its quota and native/provider owners,not its cancellable waiter.
use crate::{Error, Result};
use std::future::Future;
use tokio::sync::OwnedSemaphorePermit;
/// Once body admission is complete, move the real permit and complete read
/// future into an owned blocking job. Dropping/aborting the HTTP waiter does
/// not abort an already-started blocking job or release its slot. The job
/// drives all actual nested native/provider/serialization work to completion.
/// Incomplete bodies never enter this boundary and still retain quota only.
pub(super) async fn run(
    permit: OwnedSemaphorePermit,
    work: impl Future<Output = Result<Vec<u8>>> + Send + 'static,
) -> Result<Vec<u8>> {
    let runtime = tokio::runtime::Handle::current();
    tokio::task::spawn_blocking(move || {
        let _held = permit;
        runtime.block_on(work)
    })
    .await
    .map_err(|_| Error::NeedsRecovery)?
}
