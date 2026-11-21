//! Opt-in rich AST, local actions, table geometry and immutable image bindings.
//!
//! The separate sealed rich-content schema adds AST admission without widening
//! existing profiles, editing/history codecs or browser behavior. Values are
//! independent of any replication library. Their identities are durable content identities, not
//! semantic `EntityId`, snapshot-local paths, DOM keys or authentication claims.

pub mod actions;
mod asset_references;
pub(crate) mod ast_properties;
mod atom_edit;
pub(crate) mod block_layout;
mod block_layout_draft;
mod block_layout_patch;
mod block_layout_state;
pub(crate) mod bookmark;
mod case_change;
pub(crate) mod clipboard;
mod code_language;
mod collapse_document_selection;
pub(crate) mod details;
mod drafts;
mod flow_position;
mod general_range_ids;
mod grid_destination;
mod identity;
mod image_binding;
mod image_draft;
pub(crate) mod image_link;
mod inline_format_state;
mod input_rules;
mod list_draft;
pub(crate) mod list_numbering;
pub(crate) mod local_session;
pub(crate) mod mention;
mod native_history_usage;
mod navigate_flow;
mod navigate_grid;
pub(crate) mod page_break;
pub mod review;
mod rich_document;
mod rich_grid_selection;
mod rich_range_mapping;
mod rich_selection;
mod rich_selection_mapping;
mod rich_text_mapping;
mod ruby_v1;
mod search;
mod selection_coverage;
mod selection_format_change;
mod selection_format_state;
mod standard_inline_v1;
mod structural_drafts;
pub(crate) mod table_caption;
mod table_draft;
mod table_geometry;
mod table_paste_draft;
pub(crate) mod text_language;
mod writing_tools;

pub use asset_references::{
    RICH_ASSET_REFERENCE_MAX_BINDINGS, RichAssetReference, RichAssetReferenceError,
    inspect_rich_asset_references,
};
pub use ast_properties::{RichColumn, RichTableView};
pub use atom_edit::{AtomDeletionPlan, plan_atom_deletion, selected_flow_atom};
pub use block_layout::{
    RichBlockAlignment, RichBlockDirection, RichBlockIndent, RichBlockLayout, RichBlockLayoutError,
    RichLineHeight,
};
pub use block_layout_patch::{RichBlockLayoutPatch, RichLayoutChange};
pub use block_layout_state::{RichBlockLayoutState, RichLayoutFieldState, inspect_block_layout};
pub use bookmark::{
    RICH_BOOKMARK_NAME_MAX_BYTES, RICH_INTERNAL_LINK_PREFIX, RichBookmarkEntry, RichBookmarkError,
    RichBookmarkIndex, RichBookmarkName, RichInternalLink, internal_link_name,
    is_valid_name as is_valid_bookmark_name,
};
pub use case_change::{
    RICH_CASE_MAX_MINOR_WORD_BYTES, RICH_CASE_MAX_MINOR_WORDS, RichCaseChange, RichCaseChangeError,
    RichCaseChangePlan, RichCaseOptions, RichCaseRequest, default_title_minor_words,
    plan_rich_case_change,
};
pub use clipboard::{
    RichClipboardError, RichClipboardFragment, RichClipboardIdAllocator, RichClipboardIdentityKind,
    RichClipboardKind, RichClipboardNamespace, RichClipboardTextProjection,
    RichDocumentClipboardPlan,
};
pub use code_language::{CodeLanguage, CodeLanguageError};
pub use collapse_document_selection::collapse_document_selection;
pub use details::{
    RICH_DETAILS_KIND, RICH_DETAILS_MAX_DEPTH, RICH_DETAILS_SUMMARY_KIND, RichDetailsError,
};
pub use drafts::{RichBlockDraft, RichDraftError, TableCellDraft, TableColumnDraft, TableRowDraft};
pub use flow_position::{RichFlowParent, RichFlowPosition};
pub use general_range_ids::allocate_general_range_paragraphs;
pub use image_draft::ImageDraft;
pub use image_link::{
    RICH_IMAGE_LINK_HREF_MAX_BYTES, RichImageHref, RichImageLink, RichImageLinkError,
};
pub use inline_format_state::{
    RichInlineFormatState, RichInlineFormatStateError, inspect_inline_format,
};
pub use input_rules::{
    RICH_INPUT_RULE_MAX_RUNS, RICH_INPUT_RULE_WINDOW_UTF16, RichAutolinkCandidate,
    RichInputRuleError, RichInputRuleKind, RichInputRuleOutcome, RichInputRulePlan,
    RichInputRuleSet, RichInputRuleStep, is_rich_markdown_input_rule_trigger, plan_rich_input_rule,
    plan_rich_markdown_input_rule, plan_rich_paragraph_autolink_input_rule,
    rich_autolink_candidate,
};
pub use input_rules::{
    RICH_TYPOGRAPHY_DEFAULT_GROUPS, RICH_TYPOGRAPHY_GROUPS, RichQuoteStyle, RichTypographyConfig,
    RichTypographyConfigError, RichTypographyMatch, RichTypographyRequest, RichTypographyRule,
    rich_typography_replacement,
};
pub use list_draft::{RichListDraft, RichListItemDraft, RichListKind};
pub use list_numbering::{
    RichListNumberStyle, RichListNumbering, RichListNumberingError, RichListNumberingPatch,
};
pub use local_session::{
    RICH_COMMAND_GROUP_MAX_STEPS, RICH_TYPING_GROUP_MAX_STEPS, RICH_TYPING_GROUP_WINDOW_MS,
    RichCommandGroupError, RichGeneralPlainRangePlan, RichLocalOutcome, RichLocalSession,
    RichLocalSessionError, RichLocalSnapshot, RichLocalState, RichPendingFormatsUpdate,
    RichSelectionUpdate, RichTriggerStepError, RichTypingDeleteDirection,
};
pub use mention::{
    RICH_MENTION_FORMAT, RICH_MENTION_ID_MAX_BYTES, RICH_MENTION_ID_PROPERTY,
    RICH_MENTION_KIND_PROPERTY, RICH_MENTION_LABEL_MAX_BYTES, RICH_MENTION_LABEL_PROPERTY,
    RICH_MENTION_PREFIX, RichMention, RichMentionError, RichMentionId, RichMentionKind,
    RichMentionLabel,
};
pub use native_history_usage::NativeHistoryUsage;
pub use navigate_flow::{FlowMove, FlowNavigationOutcome, navigate_flow};
pub use navigate_grid::{
    GridBoundary, GridMove, GridNavigationMode, GridNavigationOutcome, navigate_grid,
};
pub use page_break::{RICH_PAGE_BREAK_KIND, RichPageBreakError};
pub use rich_document::{RichDocument, RichDocumentError};
pub use rich_grid_selection::ResolvedRichGrid;
pub use rich_selection::{
    ResolvedRichSelection, RichSelection, RichSelectionError, RichSelectionKind, RichTextPoint,
};
pub use rich_selection_mapping::{
    RichSelectionLoss, RichSelectionMapping, RichSelectionMappingOutcome, rebase_rich_selection,
};
pub use ruby_v1::{
    RICH_RUBY_ANNOTATION_MAX_BYTES, RICH_RUBY_ANNOTATION_V1, RICH_RUBY_EXTENSION_V1_NAME,
    RICH_RUBY_FORMAT_V1, RichRubyAnnotation, RichRubyError, ruby_extension_v1,
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
pub use table_caption::RichTableCaptionError;
pub use table_draft::TableDraft;
pub use table_paste_draft::{TableCellPasteDraft, TablePasteDraft, TablePasteMerge};
pub use text_language::{
    RICH_LANGUAGE_TAG_MAX_BYTES, RICH_LANGUAGE_TAG_MIN_BYTES, RICH_TEXT_LANGUAGE_FORMAT,
    RICH_TEXT_LANGUAGE_TAG_PROPERTY, RichLanguageTag, RichTextLanguageError,
};
pub use writing_tools::{
    RICH_WRITING_MAX_TEXT_BLOCKS, RICH_WRITING_MAX_TEXT_BYTES, RICH_WRITING_MAX_VISITED_NODES,
    RICH_WRITING_OUTLINE_LABEL_BYTES, RichHeadingOutlineEntry, RichWritingCounts, RichWritingError,
    RichWritingTools, inspect_rich_writing_tools, is_rich_placeholder_empty,
};

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
