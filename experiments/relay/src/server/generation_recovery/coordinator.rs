//! Host-only prepared owner. Clones retain real custody; verification proofs retain none.
use super::super::Host;
use crate::ServerLogGenerationRoomBackup;
use std::sync::Arc;
/// Initially inactive authenticated host over actual operational native/raster components and every
/// recovery directory lease. No router or public native-parts escape is exposed. Provider/client
/// reconciliation and atomic whole-room activation remain separate. Native service activation
/// attaches one shared serving epoch; every older handle observes that same decision.
/// Retains the original admitted archive for exact physical-prefix and raster continuity checks.
#[derive(Clone)]
pub struct PreparedLogGenerationRecoveryHost {
    pub(in crate::server) host: Host,
    pub(in crate::server) original: Arc<ServerLogGenerationRoomBackup>,
}
