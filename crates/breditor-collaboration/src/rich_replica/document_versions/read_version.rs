//! Admit a semantic version under this document's profile; no live causal state is imported.
use super::{DocumentVersionInfo, packet::Packet};
use crate::{Error, rich_replica::RichReplica};
impl RichReplica {
    /// Read immutable named-version metadata after native content, binding and digest validation.
    /// Imported author/time claims are descriptive; host authentication is not inferred from them.
    /// # Errors
    /// Wrong family, digest, document/schema/engine, invalid AST, names or budgets reject purely.
    pub fn read_document_version(&self, input: &str) -> Result<DocumentVersionInfo, Error> {
        Ok(Packet::read(self, input)?.0.info())
    }
}
