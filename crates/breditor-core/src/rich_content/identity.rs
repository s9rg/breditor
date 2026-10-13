//! Distinct checked identities; no clock/randomness or implicit path conversion.

use std::sync::Arc;
use thiserror::Error;

/// Why an opaque rich-content identity was rejected.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Error)]
pub enum RichIdentityError {
    /// The identifier violates the bounded ASCII content-identity grammar.
    #[error(
        "rich content identity must contain 1–128 ASCII identity bytes and begin alphanumerically"
    )]
    Syntax,
    /// Replica zero is reserved for absence, not a writing replica.
    #[error("a writing replica identity cannot be zero")]
    ReplicaZero,
}

fn checked(value: &str) -> Result<Arc<str>, RichIdentityError> {
    if value.is_empty()
        || value.len() > 128
        || !value.as_bytes()[0].is_ascii_alphanumeric()
        || !value.bytes().all(|byte| byte.is_ascii_alphanumeric() || b"._:-".contains(&byte))
    {
        return Err(RichIdentityError::Syntax);
    }
    Ok(Arc::from(value))
}

macro_rules! identity {
    ($name:ident, $doc:literal) => {
        #[doc = $doc]
        #[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
        pub struct $name(Arc<str>);
        impl $name {
            /// Check host-provided identity syntax, without claiming uniqueness.
            ///
            /// # Errors
            /// Rejects empty, oversized or noncanonical ASCII identity strings.
            pub fn try_new(value: impl AsRef<str>) -> Result<Self, RichIdentityError> {
                Ok(Self(checked(value.as_ref())?))
            }
            /// Borrow the exact stable identity bytes.
            #[must_use]
            pub fn as_str(&self) -> &str {
                &self.0
            }
        }
    };
}

identity!(DocumentId, "A host-scoped durable document identity, not a room permission.");
identity!(BlockId, "A durable flow-block identity, independent of its current AST path.");
identity!(TableId, "A durable table identity, distinct from a row, column or block key.");
identity!(RowId, "A durable row identity, unchanged by insertion or reordering.");
identity!(ColumnId, "A durable column identity, unchanged by insertion or reordering.");
identity!(ImageId, "An image node identity, retained when its immutable asset is replaced.");
identity!(AssetId, "An immutable host asset identity, never a signed or DOM object URL.");
identity!(AssetGeneration, "One image asset-binding generation for stale-completion guards.");
identity!(MergeId, "One merge-region identity; split retracts observed identities only.");

/// A host-allocated writer identity; exclusivity and authorization are external.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct ReplicaId(u64);

impl ReplicaId {
    /// Check a numeric identity; particular backends may reserve more values.
    ///
    /// # Errors
    /// Rejects zero; this does not grant a writer lease or validate account access.
    pub fn try_new(value: u64) -> Result<Self, RichIdentityError> {
        if value == 0 {
            return Err(RichIdentityError::ReplicaZero);
        }
        Ok(Self(value))
    }
    /// Return exact integer identity, never a floating-point browser number.
    #[must_use]
    pub const fn value(self) -> u64 {
        self.0
    }
}

/// A logical writer action. Counter serialization requires exact words/strings.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct ChangeId {
    replica: ReplicaId,
    counter: u64,
}

impl ChangeId {
    /// Bind a caller-supplied counter to an already-checked writing replica.
    #[must_use]
    pub const fn new(replica: ReplicaId, counter: u64) -> Self {
        Self { replica, counter }
    }
    /// Return the exact writer identity.
    #[must_use]
    pub const fn replica(self) -> ReplicaId {
        self.replica
    }
    /// Return the exact counter, including a valid first counter of zero.
    #[must_use]
    pub const fn counter(self) -> u64 {
        self.counter
    }
}

/// A canonical base cell belongs to one stable table/row/column triple.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct CellId {
    table: TableId,
    row: RowId,
    column: ColumnId,
}

impl CellId {
    /// Construct identity without claiming that its axes are currently visible.
    #[must_use]
    pub fn new(table: TableId, row: RowId, column: ColumnId) -> Self {
        Self { table, row, column }
    }
    /// Return the owning table identity.
    #[must_use]
    pub const fn table(&self) -> &TableId {
        &self.table
    }
    /// Return the row identity, not its current numeric index.
    #[must_use]
    pub const fn row(&self) -> &RowId {
        &self.row
    }
    /// Return the column identity, not its current numeric index.
    #[must_use]
    pub const fn column(&self) -> &ColumnId {
        &self.column
    }
}
