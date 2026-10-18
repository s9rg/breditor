use thiserror::Error;

/// Payload-free read failure; no partial statistics or outline escapes.
#[derive(Clone, Copy, Debug, Eq, Error, PartialEq)]
pub enum RichWritingError {
    /// Native Find's text/domain/node traversal budget was exceeded.
    #[error("writing tools document budget exceeded")]
    DocumentLimit,
    /// The admitted immutable AST contradicted its native proof.
    #[error("writing tools admitted document invariant failed")]
    Invariant,
}
