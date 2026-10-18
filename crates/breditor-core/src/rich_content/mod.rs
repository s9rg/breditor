//! Opt-in rich AST, local actions, table geometry and immutable image bindings.
//!
//! The separate sealed rich-content schema adds AST admission without widening
//! existing profiles, editing/history codecs or browser behavior. Values are
//! independent of any replication library. Their identities are durable content identities, not
//! semantic `EntityId`, snapshot-local paths, DOM keys or authentication claims.

pub mod actions;
pub(crate) mod ast_properties;
mod atom_edit;
pub(crate) mod block_layout;
mod block_layout_draft;
mod block_layout_patch;
mod block_layout_state;
pub(crate) mod clipboard;
mod code_language;
mod collapse_document_selection;
mod drafts;
mod flow_position;
mod general_range_ids;
mod grid_destination;
mod identity;
mod image_binding;
mod image_draft;
mod inline_format_state;
mod input_rules;
mod list_draft;
pub(crate) mod local_session;
mod navigate_flow;
mod navigate_grid;
pub mod review;
mod rich_document;
mod rich_grid_selection;
mod rich_range_mapping;
mod rich_selection;
mod rich_selection_mapping;
mod rich_text_mapping;
mod search;
mod selection_coverage;
mod selection_format_change;
mod selection_format_state;
mod standard_inline_v1;
mod structural_drafts;
mod table_draft;
mod table_geometry;
mod table_paste_draft;

pub use ast_properties::{RichColumn, RichTableView};
pub use atom_edit::{AtomDeletionPlan, plan_atom_deletion, selected_flow_atom};
pub use block_layout::{
    RichBlockAlignment, RichBlockDirection, RichBlockIndent, RichBlockLayout, RichBlockLayoutError,
    RichLineHeight,
};
pub use block_layout_patch::{RichBlockLayoutPatch, RichLayoutChange};
pub use block_layout_state::{RichBlockLayoutState, RichLayoutFieldState, inspect_block_layout};
pub use clipboard::{
    RichClipboardError, RichClipboardFragment, RichClipboardIdAllocator, RichClipboardIdentityKind,
    RichClipboardKind, RichClipboardNamespace, RichClipboardTextProjection,
    RichDocumentClipboardPlan,
};
pub use code_language::{CodeLanguage, CodeLanguageError};
pub use collapse_document_selection::collapse_document_selection;
pub use drafts::{RichBlockDraft, RichDraftError, TableCellDraft, TableColumnDraft, TableRowDraft};
pub use flow_position::{RichFlowParent, RichFlowPosition};
pub use general_range_ids::allocate_general_range_paragraphs;
pub use image_draft::ImageDraft;
pub use inline_format_state::{
    RichInlineFormatState, RichInlineFormatStateError, inspect_inline_format,
};
pub use input_rules::{
    RICH_INPUT_RULE_MAX_RUNS, RICH_INPUT_RULE_WINDOW_UTF16, RichInputRuleError, RichInputRuleKind,
    RichInputRulePlan, RichInputRuleStep, plan_rich_markdown_input_rule,
};
pub use list_draft::{RichListDraft, RichListItemDraft, RichListKind};
pub use local_session::{
    RICH_TYPING_GROUP_MAX_STEPS, RICH_TYPING_GROUP_WINDOW_MS, RichGeneralPlainRangePlan,
    RichLocalOutcome, RichLocalSession, RichLocalSessionError, RichLocalSnapshot, RichLocalState,
    RichPendingFormatsUpdate, RichSelectionUpdate, RichTypingDeleteDirection,
};
pub use navigate_flow::{FlowMove, FlowNavigationOutcome, navigate_flow};
pub use navigate_grid::{
    GridBoundary, GridMove, GridNavigationMode, GridNavigationOutcome, navigate_grid,
};
pub use rich_document::{RichDocument, RichDocumentError};
pub use rich_grid_selection::ResolvedRichGrid;
pub use rich_selection::{
    ResolvedRichSelection, RichSelection, RichSelectionError, RichSelectionKind, RichTextPoint,
};
pub use rich_selection_mapping::{
    RichSelectionLoss, RichSelectionMapping, RichSelectionMappingOutcome, rebase_rich_selection,
};
pub use search::{
    RICH_SEARCH_MAX_ENGINE_BYTES, RICH_SEARCH_MAX_INSERTED_BYTES, RICH_SEARCH_MAX_MATCHES,
    RICH_SEARCH_MAX_PATTERN_BYTES, RICH_SEARCH_MAX_REPLACEMENT_BYTES, RICH_SEARCH_MAX_TEXT_BYTES,
    RICH_SEARCH_MAX_VISITED_NODES, RichSearchDirection, RichSearchError, RichSearchMatch,
    RichSearchMode, RichSearchPreview, RichSearchQuery, RichSearchReplacePlan,
    RichSearchReplacement, RichSearchReplacementMode, RichSearchResults, RichSearchTextEdit,
    RichSearchTextReplacement, find_rich_text, plan_rich_search_replace_all,
    plan_rich_search_replace_one,
};
pub use selection_coverage::{
    RichCoverageDomain, RichCoverageExtent, RichCoveredNode, RichCoveredText, RichSelectionCoverage,
};
pub use selection_format_change::RichSelectionFormatChange;
pub use selection_format_state::inspect_selection_format;
pub use standard_inline_v1::{
    STANDARD_INLINE_EXTENSION_V1_NAME, STANDARD_INLINE_FAMILY_V1, STANDARD_INLINE_HREF_V1,
    STANDARD_INLINE_NEW_WINDOW_V1, STANDARD_INLINE_PIXELS_V1, STANDARD_INLINE_RGB24_V1,
    StandardInlineFormatV1, standard_inline_extension_v1,
};
pub use structural_drafts::{RichTaskItemDraft, RichTaskListDraft};
pub use table_draft::TableDraft;
pub use table_paste_draft::{TableCellPasteDraft, TablePasteDraft, TablePasteMerge};

pub use identity::{
    AssetGeneration, AssetId, BlockId, CellId, ChangeId, ColumnId, DocumentId, ImageId, MergeId,
    ReplicaId, RichIdentityError, RowId, TableId,
};
pub use image_binding::{
    ImageAlt, ImageBinding, ImageBindingError, ImageSize, UploadCompletionMatch, UploadToken,
};
pub use table_geometry::{
    CausalStamp, CellBounds, MergeConflict, MergeConflictReason, MergeRegion, ResolvedCell,
    ResolvedTable, RichTableLimits, TableGeometryError, TableShape,
};
