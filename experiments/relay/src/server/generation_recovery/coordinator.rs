//! Host-only prepared owner. Clones retain real custody; verification proofs retain none.
use super::super::Host;
use crate::ServerLogGenerationRoomBackup;
use std::sync::Arc;
/// Inactive authenticated host over actual operational native/raster components and every
/// recovery directory lease. No router or public native-parts escape is exposed. Provider/client
/// reconciliation, current deployment fencing and atomic whole-room activation remain separate.
/// Retains the original admitted archive for exact physical-prefix and raster continuity checks.
#[derive(Clone)]
pub struct PreparedLogGenerationRecoveryHost {
    pub(super) host: Host,
    pub(super) original: Arc<ServerLogGenerationRoomBackup>,
}
