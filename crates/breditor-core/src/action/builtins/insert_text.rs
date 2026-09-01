use std::{fmt, sync::Arc};

use thiserror::Error;

use crate::{
    action::{
        Action, ActionDecision, ActionEffects, ActionEvaluation, ActionFault, ActionId,
        ActionInput, ActionInputContract, ActionInputError, ActionInputVersion, ActionPlan,
        ActionStateContract, ActionStateDomains, ActionStateSpec, DecodeActionInput,
        MAX_ACTION_VALUE_TEXT_BYTES, TypedActionInput,
    },
    document::{FormatSet, TextFragment, TextFragmentError, TextRun, TextRunError},
    identity::QualifiedName,
    operation::{Operation, TextRange, TextSplice},
    position::Affinity,
    selection::{RangeSelection, Selection},
    state::EditorState,
    transaction::{HistoryIntent, PendingFormatsUpdate, SelectionUpdate},
};

use super::support::{
    base_shape_fits, base_total_text_fits, collapsed_selection_at_with_affinity, disabled,
    effective_typing_formats, fault, fragment_range_parts, paragraph_fragment, require_base_range,
    require_operation_budget, strict_relocation,
};

/// Stable qualified name of the built-in semantic text-insertion action.
pub const INSERT_TEXT_ACTION_NAME: &str = "breditor/insert-text";

/// Stable qualified name of the versioned text-insertion input contract.
pub const INSERT_TEXT_INPUT_CONTRACT_NAME: &str = "breditor/insert-text-input";

/// Stable code used when a text-insertion value is not a string.
pub const INSERT_TEXT_INPUT_NOT_STRING_CODE: &str = "breditor/insert-text-input-not-string";

/// Stable code used when a text-insertion string is empty.
pub const INSERT_TEXT_EMPTY_INPUT_CODE: &str = "breditor/insert-text-input-empty";

/// Stable code used when a text-insertion string exceeds an input bound.
pub const INSERT_TEXT_INPUT_LIMIT_CODE: &str = "breditor/insert-text-input-limit";

/// Stable history group offered by adjacent semantic text insertions.
pub const INSERT_TEXT_HISTORY_GROUP_NAME: &str = "breditor/typing";

/// Version of [`insert_text_input_contract`].
pub const INSERT_TEXT_INPUT_VERSION: ActionInputVersion = ActionInputVersion::one();

/// Maximum UTF-8 byte length accepted by one semantic text insertion.
///
/// This equals the fixed string budget of the action-value envelope. Active
/// document limits may impose a smaller result bound during evaluation.
pub const MAX_INSERT_TEXT_BYTES: u64 = MAX_ACTION_VALUE_TEXT_BYTES;

/// Maximum UTF-16 code-unit length accepted by one semantic text insertion.
///
/// This is an explicit semantic ceiling. It is currently redundant because a
/// valid Unicode string cannot contain more UTF-16 code units than UTF-8
/// bytes, but retaining it prevents a future byte-envelope change from
/// silently widening version 1 of this contract.
pub const MAX_INSERT_TEXT_UTF16_CODE_UNITS: u32 = 65_536;

/// Semantic action that replaces one same-paragraph range with exact text.
///
/// A collapsed insertion uses an explicit pending typing format when present,
/// then falls back to the source focus affinity. An extended replacement uses
/// the first selected run's formats, independent of direction and endpoint
/// aliases. A successful insertion consumes any pending override. The result
/// caret is published after the inserted text with [`Affinity::Before`] so
/// subsequent contextual insertion remains attached to the inserted run at a
/// formatting seam.
#[derive(Clone, Copy, Debug, Default)]
pub struct InsertTextAction;

/// Validated, bounded input for [`InsertTextAction`].
///
/// Text is retained exactly without Unicode normalization. Debug output never
/// reveals the text payload.
#[derive(Clone, Eq, PartialEq)]
pub struct InsertTextInput {
    text: Arc<str>,
    utf16_length: u32,
}

impl InsertTextInput {
    /// Creates a non-empty input within the fixed action-value string budget.
    ///
    /// # Errors
    ///
    /// Returns [`InsertTextInputError`] when the text is empty or its UTF-8 byte
    /// length exceeds [`MAX_INSERT_TEXT_BYTES`] or its UTF-16 length exceeds
    /// [`MAX_INSERT_TEXT_UTF16_CODE_UNITS`].
    pub fn try_new(text: impl AsRef<str>) -> Result<Self, InsertTextInputError> {
        let text = text.as_ref();
        if text.is_empty() {
            return Err(InsertTextInputError::Empty);
        }
        let text_bytes = u64::try_from(text.len()).unwrap_or(u64::MAX);
        if text_bytes > MAX_INSERT_TEXT_BYTES {
            return Err(InsertTextInputError::TextBytes {
                actual: text_bytes,
                maximum: MAX_INSERT_TEXT_BYTES,
            });
        }
        let utf16_length = u64::try_from(text.encode_utf16().count()).unwrap_or(u64::MAX);
        if utf16_length > u64::from(MAX_INSERT_TEXT_UTF16_CODE_UNITS) {
            return Err(InsertTextInputError::Utf16CodeUnits {
                actual: utf16_length,
                maximum: MAX_INSERT_TEXT_UTF16_CODE_UNITS,
            });
        }
        let utf16_length =
            u32::try_from(utf16_length).map_err(|_| InsertTextInputError::Utf16CodeUnits {
                actual: utf16_length,
                maximum: MAX_INSERT_TEXT_UTF16_CODE_UNITS,
            })?;
        Ok(Self { text: Arc::from(text), utf16_length })
    }

    /// Returns the exact Unicode text.
    #[must_use]
    pub fn text(&self) -> &str {
        &self.text
    }

    /// Returns the input's UTF-8 byte length.
    #[must_use]
    pub fn text_bytes(&self) -> usize {
        self.text.len()
    }

    /// Returns the input's UTF-16 code-unit length.
    #[must_use]
    pub const fn utf16_len(&self) -> u32 {
        self.utf16_length
    }
}

impl fmt::Debug for InsertTextInput {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("InsertTextInput")
            .field("text", &"<redacted>")
            .finish_non_exhaustive()
    }
}

/// Why a semantic text-insertion input cannot be constructed.
#[derive(Clone, Copy, Debug, Eq, Error, PartialEq)]
pub enum InsertTextInputError {
    /// Inserted text must contain at least one Unicode scalar.
    #[error("insert-text input cannot be empty")]
    Empty,
    /// The exact UTF-8 input exceeds the fixed action-value string budget.
    #[error("insert-text input uses {actual} UTF-8 bytes; the limit is {maximum}")]
    TextBytes {
        /// Actual UTF-8 byte length.
        actual: u64,
        /// Maximum accepted UTF-8 byte length.
        maximum: u64,
    },
    /// The exact UTF-16 input exceeds the fixed insertion-coordinate budget.
    #[error("insert-text input uses {actual} UTF-16 code units; the limit is {maximum}")]
    Utf16CodeUnits {
        /// Actual UTF-16 code-unit length.
        actual: u64,
        /// Maximum accepted UTF-16 code-unit length.
        maximum: u32,
    },
}

impl DecodeActionInput for InsertTextInput {
    fn decode(
        registered_contract: Option<&ActionInputContract>,
        input: &ActionInput,
    ) -> Result<Self, ActionInputError> {
        let Some(expected) = registered_contract else {
            return Err(ActionInputError::MissingRegisteredContract);
        };
        let ActionInput::Typed { value, .. } = input else {
            return Err(ActionInputError::ExpectedTyped { expected: expected.clone() });
        };
        let text =
            value.as_string().ok_or_else(|| invalid_input(INSERT_TEXT_INPUT_NOT_STRING_CODE))?;
        Self::try_new(text).map_err(|error| match error {
            InsertTextInputError::Empty => invalid_input(INSERT_TEXT_EMPTY_INPUT_CODE),
            InsertTextInputError::TextBytes { .. }
            | InsertTextInputError::Utf16CodeUnits { .. } => {
                invalid_input(INSERT_TEXT_INPUT_LIMIT_CODE)
            }
        })
    }
}

impl TypedActionInput for InsertTextInput {}

/// Returns the stable built-in semantic text-insertion action identity.
#[must_use]
pub fn insert_text_action_id() -> ActionId {
    ActionId::from_qualified_name(QualifiedName::from_known_static(INSERT_TEXT_ACTION_NAME))
}

/// Returns the exact typed-input contract accepted by [`InsertTextAction`].
#[must_use]
pub fn insert_text_input_contract() -> ActionInputContract {
    ActionInputContract::new(
        QualifiedName::from_known_static(INSERT_TEXT_INPUT_CONTRACT_NAME),
        INSERT_TEXT_INPUT_VERSION,
    )
}

impl Action for InsertTextAction {
    type Input = InsertTextInput;

    fn state_spec() -> ActionStateSpec {
        let reads = ActionStateDomains::DOCUMENT
            | ActionStateDomains::SELECTION
            | ActionStateDomains::PENDING_FORMATS
            | ActionStateDomains::CONTEXT
            | ActionStateDomains::SNAPSHOT;
        let may_write = ActionStateDomains::DOCUMENT
            | ActionStateDomains::SELECTION
            | ActionStateDomains::PENDING_FORMATS
            | ActionStateDomains::HISTORY
            | ActionStateDomains::SNAPSHOT;
        ActionStateSpec::new(ActionStateContract::stateless(), ActionEffects::new(reads, may_write))
    }

    fn evaluate(
        &self,
        state: &EditorState,
        input: &Self::Input,
    ) -> Result<ActionEvaluation, ActionFault> {
        evaluate_insert_text(state, input).map(ActionEvaluation::stateless)
    }
}

fn evaluate_insert_text(
    state: &EditorState,
    input: &InsertTextInput,
) -> Result<ActionDecision, ActionFault> {
    let range = match require_base_range(state)? {
        Ok(range) => range,
        Err(reason) => return Ok(ActionDecision::Disabled(reason)),
    };
    if let Some(decision) = require_operation_budget(state, 1) {
        return Ok(decision);
    }

    let paragraph_path = range.start().paragraph_path();
    let source = paragraph_fragment(state, paragraph_path, range.start().offset())?;
    let (prefix, selected, suffix) =
        fragment_range_parts(&source, range.start().offset(), range.end().offset())?;
    let formats = if range.is_collapsed() {
        effective_typing_formats(
            state,
            &source,
            range.start().offset(),
            source_range(state)?.focus().affinity(),
        )?
    } else {
        selected
            .iter()
            .next()
            .map(|run| run.formats().clone())
            .ok_or_else(|| fault("breditor/insert-text-selected-format-fault"))?
    };

    let replacement = match replacement_fragment(input, formats) {
        Ok(replacement) => replacement,
        Err(ReplacementError::Capacity) => {
            return Ok(disabled("breditor/result-limit-exceeded"));
        }
        Err(ReplacementError::Invariant) => {
            return Err(fault("breditor/insert-text-input-invariant-fault"));
        }
    };
    let Some(result) = concat_result(&prefix, &replacement, &suffix)? else {
        return Ok(disabled("breditor/result-limit-exceeded"));
    };
    if !base_shape_fits(state, 1, source.len(), &[&result])
        || !base_total_text_fits(state, source.text_bytes(), result.text_bytes())
    {
        return Ok(disabled("breditor/result-limit-exceeded"));
    }

    let splice_range =
        TextRange::try_new(paragraph_path.clone(), range.start().offset(), range.end().offset())
            .map_err(|_| fault("breditor/insert-text-range-fault"))?;
    let splice = TextSplice::try_new(splice_range, selected, replacement)
        .map_err(|_| fault("breditor/insert-text-splice-fault"))?;
    let result_caret = range
        .start()
        .offset()
        .checked_add(u64::from(input.utf16_len()))
        .map_err(|_| fault("breditor/insert-text-caret-offset-fault"))?;
    let selection = collapsed_selection_at_with_affinity(
        paragraph_path,
        &result,
        result_caret,
        Affinity::Before,
    )?;

    Ok(ActionDecision::Enabled(ActionPlan::new(
        vec![Operation::from(splice)],
        strict_relocation(),
        SelectionUpdate::Set(Some(selection)),
        PendingFormatsUpdate::Set(None),
        HistoryIntent::Merge {
            group: QualifiedName::from_known_static(INSERT_TEXT_HISTORY_GROUP_NAME),
        },
    )))
}

fn source_range(state: &EditorState) -> Result<&RangeSelection, ActionFault> {
    let Some(Selection::Range(range)) = state.selection() else {
        return Err(fault("breditor/insert-text-selection-fault"));
    };
    Ok(range)
}

enum ReplacementError {
    Capacity,
    Invariant,
}

fn replacement_fragment(
    input: &InsertTextInput,
    formats: FormatSet,
) -> Result<TextFragment, ReplacementError> {
    match TextRun::try_new(input.text().to_owned(), formats) {
        Ok(run) => Ok(TextFragment::from(run)),
        Err(TextRunError::TooLong) => Err(ReplacementError::Capacity),
        Err(TextRunError::Empty) => Err(ReplacementError::Invariant),
    }
}

fn concat_result(
    prefix: &TextFragment,
    replacement: &TextFragment,
    suffix: &TextFragment,
) -> Result<Option<TextFragment>, ActionFault> {
    let with_replacement = match prefix.try_concat(replacement) {
        Ok(result) => result,
        Err(error) if fragment_error_is_capacity(&error) => return Ok(None),
        Err(_) => return Err(fault("breditor/insert-text-result-fold-fault")),
    };
    match with_replacement.try_concat(suffix) {
        Ok(result) => Ok(Some(result)),
        Err(error) if fragment_error_is_capacity(&error) => Ok(None),
        Err(_) => Err(fault("breditor/insert-text-result-fold-fault")),
    }
}

const fn fragment_error_is_capacity(error: &TextFragmentError) -> bool {
    matches!(
        error,
        TextFragmentError::TextOffset(_)
            | TextFragmentError::TextByteLengthOverflow
            | TextFragmentError::TextRun(_)
    )
}

fn invalid_input(code: &'static str) -> ActionInputError {
    ActionInputError::InvalidValue { code: QualifiedName::from_known_static(code) }
}
