//! Validated names and persisted semantic identities.

mod entity_id;
mod qualified_name;

pub use entity_id::{EntityId, EntityIdError, MAX_ENTITY_ID_BYTES};
pub use qualified_name::{MAX_QUALIFIED_NAME_BYTES, NamePart, QualifiedName, QualifiedNameError};
