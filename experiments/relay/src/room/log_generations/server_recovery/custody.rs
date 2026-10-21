//! Retained actual parent/native/raster custody, separable only through crate-private host transfer.
use super::super::control_seal::RecoveryControlSeal;
use super::{raster_directory::RasterCustody, selection::Marker};
use crate::log::generations::GenerationDirectory;
pub(super) struct JoinedRecoveryCustody {
    pub controls: RecoveryControlSeal,
    pub native_controls: RecoveryControlSeal,
    pub directory: GenerationDirectory,
    pub marker: Marker,
    pub native_directory: GenerationDirectory,
    pub raster: RasterCustody,
}
