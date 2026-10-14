//! Exact guarded local table rewrite, never a shared root-replacement operation.

use super::{
    RichAction, RichActionError, RichEdit, guard::TargetGuard, rewrite_properties::replace_node,
};
use crate::rich_content::{RichDocument, TableId, ast_properties};
use crate::{
    document::{ElementNode, NodeRef, PropertyMap, PropertyValue},
    state::EditorContext,
};

#[derive(Clone, Debug, Eq, PartialEq)]
pub(super) struct TablePatch {
    guard: TargetGuard,
    table: TableId,
    expected: NodeRef,
    replacement: NodeRef,
}

pub(super) fn table_node<'a>(
    document: &'a RichDocument,
    table: &TableId,
) -> Result<&'a NodeRef, RichActionError> {
    document
        .table_path(table)
        .and_then(|path| document.document().node_at(path).ok())
        .ok_or(RichActionError::MissingTarget)
}

pub(super) fn rebuild(
    node: &NodeRef,
    columns: Option<Vec<PropertyValue>>,
    rows: Vec<NodeRef>,
) -> Result<NodeRef, RichActionError> {
    let element = node.as_element().ok_or(RichActionError::Rewrite)?;
    let properties = if let Some(columns) = columns {
        let mut values: std::collections::BTreeMap<_, _> = element
            .properties()
            .iter()
            .map(|(name, value)| (name.clone(), value.clone()))
            .collect();
        values.insert(
            crate::identity::QualifiedName::try_new("breditor/columns")
                .map_err(|_| RichActionError::Rewrite)?,
            PropertyValue::array(columns),
        );
        PropertyMap::try_from_sorted(values.into_iter().collect())
            .map_err(|_| RichActionError::Rewrite)?
    } else {
        element.properties().clone()
    };
    Ok(NodeRef::element(
        ElementNode::try_new(
            element.kind().clone(),
            element.entity_id().cloned(),
            properties,
            rows,
        )
        .map_err(|_| RichActionError::Rewrite)?,
    ))
}

pub(super) fn column_properties(node: &NodeRef) -> Result<Vec<PropertyValue>, RichActionError> {
    ast_properties::property(node.as_element().ok_or(RichActionError::Rewrite)?, "columns")
        .and_then(PropertyValue::as_array)
        .map(<[PropertyValue]>::to_vec)
        .ok_or(RichActionError::Rewrite)
}

impl TablePatch {
    pub(super) fn edit(
        &self,
        context: &EditorContext,
        document: &RichDocument,
        inverse: RichAction,
    ) -> Result<Option<RichEdit>, RichActionError> {
        let candidate = self.apply(context, document)?;
        if candidate.document().root() == document.document().root() {
            return Ok(None);
        }
        Ok(Some(RichEdit { before: document.clone(), document: candidate, inverse }))
    }
    pub(super) fn capture(
        document: &RichDocument,
        table: &TableId,
        replacement: NodeRef,
    ) -> Result<Self, RichActionError> {
        let path = document.table_path(table).ok_or(RichActionError::MissingTarget)?;
        Ok(Self {
            guard: TargetGuard::capture(document, path)?,
            table: table.clone(),
            expected: table_node(document, table)?.clone(),
            replacement,
        })
    }
    pub(super) fn inverse(&self) -> Self {
        Self {
            guard: self.guard.clone(),
            table: self.table.clone(),
            expected: self.replacement.clone(),
            replacement: self.expected.clone(),
        }
    }
    pub(super) fn apply(
        &self,
        context: &EditorContext,
        document: &RichDocument,
    ) -> Result<RichDocument, RichActionError> {
        let path = document.table_path(&self.table).ok_or(RichActionError::MissingTarget)?;
        self.guard.check(context, document, path)?;
        if table_node(document, &self.table)? != &self.expected {
            return Err(RichActionError::StaleTarget);
        }
        replace_node(context, document, path, &self.replacement)
    }
}
