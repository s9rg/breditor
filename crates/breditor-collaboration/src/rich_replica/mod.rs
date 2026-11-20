//! Rich AST materialization over independently replicated structure, text and owned metadata.
//!
//! This is the in-progress shared editor coordinator, not a shipping transport.
//! A semantic Document V2 is a validated export, never a mutable shared root register.

pub mod actions;
mod affine_text_range;
mod annotations;
mod apply_markdown_input_rule;
mod atom_edit;
mod block_layout_state;
mod captions;
mod caret_formats;
mod cell_bodies;
mod change_document_formats;
mod change_document_layout;
mod change_selection_formats;
mod change_selection_layout;
mod clipboard;
mod clipboard_flow;
mod clipboard_grid;
mod clipboard_interchange;
mod clipboard_namespace;
mod clipboard_plan;
mod close_typing_group;
mod collapse_document_selection;
mod column_order;
mod copy_document_clipboard;
mod copy_general_clipboard;
mod creation;
mod delete_atom;
mod delete_typing_range;
mod document_checkpoint;
mod document_identity;
mod document_tools;
mod document_versions;
mod enable_document_selection;
mod enable_typing_history;
mod exit_code_block;
mod flow_parent;
mod general_history;
mod general_range_input_json;
mod general_range_plan;
mod general_range_preview;
mod general_range_session;
mod history_cursors;
mod history_keys;
mod history_metadata;
#[cfg(any(target_arch = "wasm32", test))]
pub(crate) mod initial_read_only;
mod initialize;
mod inline_format_state;
mod insert_general_paragraph;
mod insert_hard_break;
mod insert_paragraph_adjacent;
mod insert_plain_text;
mod insert_plain_text_with_markdown_rules;
mod insert_typing_text;
mod insert_typing_text_with_markdown_rules;
#[cfg(test)]
mod journal_capacity_tests;
mod layout_fields;
mod list_structure;
mod list_targets;
mod materialize;
mod merges;
mod model;
mod navigate_flow;
mod navigate_grid;
mod observation;
mod packet_asset_references;
mod paragraphs;
mod paste_document_clipboard;
mod paste_flow_at_text;
mod paste_general_flow_clipboard;
mod paste_general_inline_clipboard;
mod patch_inline_format_properties;
mod placeholder_empty;
mod placement;
mod plan_general_range_plain_text;
mod planning;
mod presence;
mod profile;
mod project_clipboard_text;
mod projection_cache;
mod protocol;
mod range_plan;
mod receive_semantic_remote_v1;
mod reconcile_retained_branch;
mod recovery_origin;
mod replace_atom_plain_text;
mod replace_atom_typing_text;
mod replace_document_plain_text;
mod replace_document_typing_text;
mod replace_general_range_plain_text;
mod replace_general_range_text;
mod replace_general_range_typing_text;
mod replace_general_selection_text;
mod replace_general_typing_text;
mod replace_plain_text_range;
mod replay_projections;
mod retained_asset_references;
mod retained_asset_references_json;
mod retained_branch_input_bytes;
mod retained_history;
mod review_anchor;
mod review_comments;
mod reviewed_history;
mod search;
mod segmented_history;
mod select_document;
pub mod selection;
mod selection_coverage;
mod selection_formats;
mod session;
mod set_pending_formats;
mod set_read_only;
mod set_selection;
mod split_with_autolink;
mod structural_text;
mod suggestions;
mod target_kinds;
mod target_validation;
mod text;
pub mod text_flow;
mod typing_checkpoint;
mod typing_history;
mod ui_state;
mod update_frame;
mod v4_inline;
mod v4_block_fields;
mod v4_projection;
mod verify_retained_branch;
mod view;
mod writer_transport;
mod writing_tools;
mod writing_tools_json;

pub use actions::Command;
pub use breditor_core::rich_content::{RICH_ASSET_REFERENCE_MAX_BINDINGS, RichAssetReference};
/// Private shared projection revision; incompatible causal interpretations must reject old frames.
pub const MODEL_VERSION: u32 = 11;
pub use affine_text_range::{
    AffineTextDomain, AffineTextRangeConflict, AffineTextRangeInfo, AffineTextRangeResolution,
    AffineTextSegment,
};
pub use clipboard::{ClipboardContent, PasteTarget};
pub use clipboard_namespace::ClipboardNamespace;
pub use document_versions::{
    DocumentVersionInfo, DocumentVersionRestorePlan, DocumentVersionSource, VersionAssetReference,
    VersionBlockChange, VersionChangeAspect, VersionComparison, VersionNodeTarget,
};
pub use navigate_grid::GridNavigationResult;
pub use observation::SharedObservation;
pub use packet_asset_references::{
    PacketAssetIdentity, PacketAssetOutcome, PacketAssetReferences,
    SHARED_PACKET_ASSET_REFERENCE_MAX_JSON_BYTES,
};
pub use presence::PresenceResolution;
pub use presence::{DocumentPresenceResolution, DocumentPresenceSelection};
pub use profile::SharedRichProfile;
pub use retained_asset_references::SHARED_ASSET_REFERENCE_MAX_CAUSAL_ATOMS;
pub use review_anchor::{
    ReviewAnchorClipboard, ReviewAnchorLoss, ReviewAnchorQuote, ReviewAnchorResolution,
    ReviewAnchorTarget, ReviewQuoteLoss,
};
pub use review_comments::{
    DocumentReviewBatchPreparation, PreparedDocumentReviewBatch, ResolvedReviewAnchor,
    ResolvedReviewThread, ResolvedReviewView, RetainedNativeBranchBytes,
    RetainedNativeBranchOutcome, RetainedNativeBranchSource,
};
pub use reviewed_history::{OwnedSuggestionAcceptance, ReviewedHistoryIdentity};
pub use search::SharedSearchResults;
pub use segmented_history::{DocumentHistoryCapacity, SegmentedHistoryInfo};
pub use session::RichReplica;
pub use suggestions::{
    DocumentSuggestionClipboardPlan, DocumentSuggestionDraft, DocumentSuggestionEdit,
    DocumentSuggestionEffect, DocumentSuggestionEffectVerification, DocumentSuggestionFormatRebase,
    DocumentSuggestionFormatRebaseConflict, DocumentSuggestionInfo, DocumentSuggestionPreparation,
    DocumentSuggestionPreview, DocumentSuggestionRevisionInfo, DocumentSuggestionRevisionSource,
    DocumentSuggestionScope, DocumentSuggestionSource, DocumentSuggestionTextRebase,
    DocumentSuggestionTextRebaseConflict, DocumentSuggestionTextRebasePolicy,
    PreparedDocumentSuggestionEffect, SuggestionAssetRelocation, SuggestionConflictTarget,
    VerifiedDocumentSuggestionEffect,
};
pub use ui_state::{PendingFormatsUpdate, SelectionUpdate};
pub use writer_transport::{
    PreparedWriterGroup, WriterClock, WriterDependency, WriterGroupPreparation, WriterReceipt,
    WriterReceiptRetention,
};
