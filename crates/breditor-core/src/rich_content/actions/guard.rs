//! Stable document/schema/node guards; no cached numeric paths are authored.

use super::RichActionError;
use crate::rich_content::{BlockId, DocumentId, RichDocument, ast_properties};
use crate::{
    document::Document, position::NodePath, schema::DurableSchemaBinding, state::EditorContext,
};

#[derive(Clone, Debug, Eq, PartialEq)]
pub(super) struct TargetGuard {
    scope: DocumentGuard,
    block: BlockId,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(super) struct DocumentGuard {
    document: DocumentId,
    schema: DurableSchemaBinding,
}

impl DocumentGuard {
    pub(super) fn capture(document: &RichDocument) -> Self {
        Self {
            document: document.id().clone(),
            schema: DurableSchemaBinding::new(
                document.document().schema().clone(),
                document.document().schema_fingerprint(),
            ),
        }
    }
    pub(super) fn check(
        &self,
        context: &EditorContext,
        document: &RichDocument,
    ) -> Result<(), RichActionError> {
        if !context.schema().is_rich_content_profile()
            || document.id() != &self.document
            || context.schema().durable_binding() != self.schema
            || document.document().schema() != self.schema.schema()
            || document.document().schema_fingerprint() != self.schema.fingerprint()
        {
            return Err(RichActionError::Binding);
        }
        if !document.document().is_proven_for(context.schema(), context.limits()) {
            Document::try_new(
                context.schema(),
                document.document().root().clone(),
                context.limits(),
            )?;
        }
        Ok(())
    }
}

impl TargetGuard {
    pub(super) fn capture(
        document: &RichDocument,
        path: &NodePath,
    ) -> Result<Self, RichActionError> {
        let node = document
            .document()
            .node_at(path)
            .ok()
            .and_then(crate::document::NodeRef::as_element)
            .ok_or(RichActionError::Rewrite)?;
        let block = BlockId::try_new(
            ast_properties::string(node, "block-id").map_err(|_| RichActionError::Rewrite)?,
        )
        .map_err(|_| RichActionError::Rewrite)?;
        Ok(Self { scope: DocumentGuard::capture(document), block })
    }

    pub(super) fn check(
        &self,
        context: &EditorContext,
        document: &RichDocument,
        path: &NodePath,
    ) -> Result<(), RichActionError> {
        // Even a no-op must honor a different compiled proof or stricter policy.
        self.scope.check(context, document)?;
        let node = document
            .document()
            .node_at(path)
            .ok()
            .and_then(crate::document::NodeRef::as_element)
            .ok_or(RichActionError::MissingTarget)?;
        if ast_properties::string(node, "block-id").map_err(|_| RichActionError::Rewrite)?
            != self.block.as_str()
        {
            return Err(RichActionError::StaleTarget);
        }
        Ok(())
    }
}
