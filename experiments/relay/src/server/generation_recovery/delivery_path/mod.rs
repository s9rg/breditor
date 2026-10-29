//! Complete ordered native/raster predecessor path; old single-prior contracts stay unchanged.
mod identity;
mod limits;
mod proof;
mod selected;
mod verify;
pub use identity::{
    MAX_DELIVERY_PATH_ANCESTORS, MAX_DELIVERY_PATH_ARCHIVE_BYTES,
    ServerLogGenerationDeliveryPathIdentity,
};
pub use proof::VerifiedServerLogGenerationDeliveryPath;
