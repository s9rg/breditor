use thiserror::Error;

use crate::{extension::ExtensionId, identity::QualifiedName};

/// Why a sealed base-text schema profile could not be compiled.
///
/// Compilation is all-or-nothing and diagnostics are selected in canonical
/// phases, independent of manifest or declaration input order.
#[derive(Clone, Debug, Eq, Error, PartialEq)]
#[non_exhaustive]
pub enum SchemaCompilationError {
    /// The caller attempted to reuse the namespace reserved for core schemas.
    #[error("schema name {name} is reserved for the Breditor core")]
    ReservedSchemaName {
        /// Rejected profile schema name.
        name: QualifiedName,
    },
    /// An installed extension attempted to use the namespace reserved for the core.
    #[error("extension identity {extension} uses the reserved Breditor namespace")]
    ReservedExtensionName {
        /// Rejected exact extension identity.
        extension: ExtensionId,
    },
    /// The aggregate contributed-format count exceeds the sealed profile ceiling.
    #[error("profile has {actual} extension inline formats; the maximum is {maximum}")]
    TooManyInlineFormats {
        /// Rejected fixed-width aggregate count, excluding built-in strong.
        actual: u32,
        /// Fixed aggregate extension-format ceiling.
        maximum: u32,
    },
    /// More than one manifest claimed the same inline-format kind.
    #[error("inline-format kind {kind} is owned by both {first_owner} and {second_owner}")]
    DuplicateInlineFormat {
        /// Duplicated qualified format kind.
        kind: QualifiedName,
        /// Lexically first exact owning extension identity.
        first_owner: ExtensionId,
        /// Lexically second exact owning extension identity.
        second_owner: ExtensionId,
    },
    /// An extension attempted to claim a core-owned inline-format kind.
    #[error("inline-format name {kind} is reserved for the Breditor core, not {owner}")]
    ReservedInlineFormatName {
        /// Rejected qualified format kind.
        kind: QualifiedName,
        /// Exact manifest that claimed the kind.
        owner: ExtensionId,
    },
    /// The checked public projection exposed an impossible compiler invariant.
    #[error("the checked base-text schema projection violated an internal compiler invariant")]
    InternalInvariant,
}
