//! Preserve client-selected cuts from before the successor's actual restore origin.
mod identity;
mod proof;
mod verify;

pub use identity::{
    ServerLogGenerationHandoverDeliveryPathIdentity, ServerLogGenerationHandoverDeliveryPathOptions,
};
pub use proof::VerifiedServerLogGenerationHandoverDeliveryPath;
