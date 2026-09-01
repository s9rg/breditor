use thiserror::Error;

use crate::{
    document::{Document, FormatSet},
    identity::QualifiedName,
    schema::{SchemaId, ValidationReport},
    selection::{ResolvedSelection, Selection, SelectionError},
    state::{EditorContext, SnapshotId},
};

/// A complete immutable editor snapshot.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EditorState {
    context: EditorContext,
    snapshot: SnapshotId,
    document: Document,
    selection: Option<Selection>,
    pending_formats: Option<FormatSet>,
}

/// Exhaustive borrowed view used by the persistent editor-state boundary.
pub(crate) struct EditorStateCheckpointParts<'a> {
    pub(crate) context: &'a EditorContext,
    pub(crate) snapshot: &'a SnapshotId,
    pub(crate) document: &'a Document,
    pub(crate) selection: Option<&'a Selection>,
    pub(crate) pending_formats: Option<&'a FormatSet>,
}

/// One exhaustively classified field of [`EditorState`].
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum EditorStateField {
    Context,
    Snapshot,
    Document,
    Selection,
    PendingFormats,
}

impl EditorState {
    /// Returns every persisted state field as one exhaustive borrowed view.
    pub(crate) fn checkpoint_parts(&self) -> EditorStateCheckpointParts<'_> {
        let Self { context, snapshot, document, selection, pending_formats } = self;
        EditorStateCheckpointParts {
            context,
            snapshot,
            document,
            selection: selection.as_ref(),
            pending_formats: pending_formats.as_ref(),
        }
    }

    /// Classifies every field that differs from `previous`.
    pub(crate) fn changed_fields_from(
        &self,
        previous: &Self,
    ) -> impl Iterator<Item = EditorStateField> {
        // Exhaustive destructuring is intentional. Adding state must make this
        // classifier fail to compile until the new field is represented.
        let Self { context, snapshot, document, selection, pending_formats } = self;
        let Self {
            context: previous_context,
            snapshot: previous_snapshot,
            document: previous_document,
            selection: previous_selection,
            pending_formats: previous_pending_formats,
        } = previous;

        [
            (context != previous_context).then_some(EditorStateField::Context),
            (snapshot != previous_snapshot).then_some(EditorStateField::Snapshot),
            (document != previous_document).then_some(EditorStateField::Document),
            (selection != previous_selection).then_some(EditorStateField::Selection),
            (pending_formats != previous_pending_formats)
                .then_some(EditorStateField::PendingFormats),
        ]
        .into_iter()
        .flatten()
    }

    /// Validates and publishes a complete editor snapshot.
    ///
    /// `pending_formats` is an explicit typing override: `None` derives formats
    /// from context, while `Some(empty)` explicitly requests unformatted text.
    /// It is valid only with a spatially collapsed range selection.
    ///
    /// The caller must allocate a lineage ID that is unique for this independent
    /// editor history. The core fixes the initial revision at zero and binds
    /// every transaction to the complete base state, so reusing an ID cannot
    /// make a transaction silently apply to different content.
    ///
    /// # Errors
    ///
    /// Returns [`EditorStateError`] on schema/limit, selection, or pending-format
    /// failure.
    pub fn try_new(
        context: &EditorContext,
        lineage: crate::state::LineageId,
        document: Document,
        selection: Option<Selection>,
        pending_formats: Option<FormatSet>,
    ) -> Result<Self, EditorStateError> {
        let snapshot = SnapshotId::new(lineage, crate::state::Revision::ZERO);
        if document.schema() != context.schema().id() {
            return Err(EditorStateError::SchemaMismatch {
                document_schema: document.schema().clone(),
                context_schema: context.schema().id().clone(),
            });
        }
        let document = document.try_revalidate(context.schema(), context.limits())?;
        validate_parts(context, &document, selection.as_ref(), pending_formats.as_ref())?;
        Ok(Self { context: context.clone(), snapshot, document, selection, pending_formats })
    }

    /// Returns the exact schema/limit context that proved this state.
    #[must_use]
    pub const fn context(&self) -> &EditorContext {
        &self.context
    }

    /// Returns the exact snapshot identity.
    #[must_use]
    pub const fn snapshot(&self) -> &SnapshotId {
        &self.snapshot
    }

    /// Returns the immutable content document.
    #[must_use]
    pub const fn document(&self) -> &Document {
        &self.document
    }

    /// Returns the active selection, or `None` when the editor is not selected.
    #[must_use]
    pub const fn selection(&self) -> Option<&Selection> {
        self.selection.as_ref()
    }

    /// Returns the explicit typing-format override.
    #[must_use]
    pub const fn pending_formats(&self) -> Option<&FormatSet> {
        self.pending_formats.as_ref()
    }

    pub(crate) fn try_from_validated_parts(
        context: &EditorContext,
        snapshot: SnapshotId,
        document: Document,
        selection: Option<Selection>,
        pending_formats: Option<FormatSet>,
    ) -> Result<Self, EditorStateError> {
        if document.schema() != context.schema().id() {
            return Err(EditorStateError::SchemaMismatch {
                document_schema: document.schema().clone(),
                context_schema: context.schema().id().clone(),
            });
        }
        let document = if document.is_proven_for(context.schema(), context.limits()) {
            document
        } else {
            document.try_revalidate(context.schema(), context.limits())?
        };
        validate_parts(context, &document, selection.as_ref(), pending_formats.as_ref())?;
        Ok(Self { context: context.clone(), snapshot, document, selection, pending_formats })
    }
}

fn validate_parts(
    context: &EditorContext,
    document: &Document,
    selection: Option<&Selection>,
    pending_formats: Option<&FormatSet>,
) -> Result<(), EditorStateError> {
    if document.schema() != context.schema().id() {
        return Err(EditorStateError::SchemaMismatch {
            document_schema: document.schema().clone(),
            context_schema: context.schema().id().clone(),
        });
    }
    let resolved =
        selection.map(|selection| selection.resolve(context.schema(), document)).transpose()?;
    if let Some(formats) = pending_formats {
        let Some(ResolvedSelection::Range(range)) = resolved else {
            return Err(EditorStateError::PendingFormatsRequireCollapsedRange);
        };
        if !range.is_collapsed() {
            return Err(EditorStateError::PendingFormatsRequireCollapsedRange);
        }
        validate_pending_formats(context, formats)?;
    }
    Ok(())
}

fn validate_pending_formats(
    context: &EditorContext,
    formats: &FormatSet,
) -> Result<(), PendingFormatError> {
    if formats.len() > context.limits().max_formats_per_text() {
        return Err(PendingFormatError::TooMany {
            actual: formats.len(),
            maximum: context.limits().max_formats_per_text(),
        });
    }
    for format in formats {
        if !context.schema().allows_text_format(format.kind()) {
            return Err(PendingFormatError::UnknownKind { kind: format.kind().clone() });
        }
        if !format.properties().is_empty() {
            return Err(PendingFormatError::PropertiesNotAllowed { kind: format.kind().clone() });
        }
    }
    Ok(())
}

/// Why a complete editor snapshot cannot be published.
#[derive(Clone, Debug, Eq, Error, PartialEq)]
pub enum EditorStateError {
    /// Content was validated under a different schema identity.
    #[error("document schema {document_schema} does not match context schema {context_schema}")]
    SchemaMismatch {
        /// Schema recorded on the document.
        document_schema: SchemaId,
        /// Schema owned by the execution context.
        context_schema: SchemaId,
    },
    /// Content failed complete schema or resource validation.
    #[error(transparent)]
    InvalidDocument(#[from] ValidationReport),
    /// The active selection is invalid in this exact document snapshot.
    #[error(transparent)]
    InvalidSelection(#[from] SelectionError),
    /// A pending typing override requires a collapsed range selection.
    #[error("pending formats require a spatially collapsed range selection")]
    PendingFormatsRequireCollapsedRange,
    /// A pending typing format is not permitted by this context.
    #[error(transparent)]
    InvalidPendingFormats(#[from] PendingFormatError),
}

/// Why pending typing formats are incompatible with an editor context.
#[derive(Clone, Debug, Eq, Error, PartialEq)]
pub enum PendingFormatError {
    /// Too many formats were requested for one insertion.
    #[error("pending format count is {actual}; the configured maximum is {maximum}")]
    TooMany {
        /// Actual format count.
        actual: usize,
        /// Configured maximum.
        maximum: usize,
    },
    /// The compiled schema does not register the format kind.
    #[error("pending format `{kind}` is not registered by the compiled schema")]
    UnknownKind {
        /// Rejected format kind.
        kind: QualifiedName,
    },
    /// The base schema does not allow format properties.
    #[error("pending format `{kind}` does not allow properties")]
    PropertiesNotAllowed {
        /// Rejected format kind.
        kind: QualifiedName,
    },
}
