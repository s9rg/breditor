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
    operation::{Operation, RootTextBoundary, RootTextRange, RootTextReplace},
    position::{Affinity, NodePath},
    selection::{RangeSelection, Selection},
    state::EditorState,
    transaction::{HistoryIntent, PendingFormatsUpdate, SelectionUpdate},
};

use super::{
    super::text_position::TextRangeSelection,
    support::{
        CrossParagraphTextSourceError, base_shape_fits, base_total_text_fits,
        capture_cross_paragraph_text_source, collapsed_selection_at_with_affinity, disabled,
        effective_typing_formats, fault, fragment_range_parts, paragraph_fragment,
        property_fragment_delta_fits, require_operation_budget, require_paragraph_structure_range,
        strict_relocation,
    },
};

/// Stable qualified name of the built-in plain-text insertion action.
pub const INSERT_PLAIN_TEXT_ACTION_NAME: &str = "breditor/insert-plain-text";

/// Stable qualified name of the versioned plain-text input contract.
pub const INSERT_PLAIN_TEXT_INPUT_CONTRACT_NAME: &str = "breditor/insert-plain-text-input";

/// Stable code used when a plain-text insertion value is not a string.
pub const INSERT_PLAIN_TEXT_INPUT_NOT_STRING_CODE: &str =
    "breditor/insert-plain-text-input-not-string";

/// Stable code used when a plain-text insertion string is empty.
pub const INSERT_PLAIN_TEXT_EMPTY_INPUT_CODE: &str = "breditor/insert-plain-text-input-empty";

/// Stable code reserved for a plain-text value that exceeds its text-size bound.
///
/// The current generic [`crate::action::ActionValue`] string envelope has the
/// same byte ceiling, so an oversized wire value fails during value
/// construction before this action decoder runs. The code remains reserved by
/// input contract version 1 in case the generic envelope is widened later.
pub const INSERT_PLAIN_TEXT_INPUT_LIMIT_CODE: &str = "breditor/insert-plain-text-input-limit";

/// Stable code used when normalized input contains too many paragraphs.
pub const INSERT_PLAIN_TEXT_PARAGRAPH_LIMIT_CODE: &str =
    "breditor/insert-plain-text-paragraph-limit";

/// Version of [`insert_plain_text_input_contract`].
pub const INSERT_PLAIN_TEXT_INPUT_VERSION: ActionInputVersion = ActionInputVersion::one();

/// Maximum source UTF-8 byte length accepted by one plain-text insertion.
pub const MAX_INSERT_PLAIN_TEXT_BYTES: u64 = MAX_ACTION_VALUE_TEXT_BYTES;

/// Maximum source UTF-16 code-unit length accepted by one plain-text insertion.
///
/// This is explicit even though the byte envelope currently makes it
/// redundant for valid Unicode. It prevents a future envelope change from
/// silently widening version 1 of this contract.
pub const MAX_INSERT_PLAIN_TEXT_UTF16_CODE_UNITS: u32 = 65_536;

/// Maximum structural paragraphs produced by one plain-text insertion.
pub const MAX_INSERT_PLAIN_TEXT_PARAGRAPHS: u32 = 10_000;

/// Semantic action that atomically inserts normalized structural plain text.
///
/// Version 1 accepts a non-empty Unicode string. CRLF, lone CR, and LF are
/// normalized to paragraph boundaries; every other scalar is retained exactly,
/// including Unicode line-separator characters. Leading, trailing, and
/// consecutive boundaries therefore produce empty paragraphs. The complete
/// selection is replaced by exactly one guarded [`RootTextReplace`] for both
/// same- and cross-paragraph ranges, so no intermediate split/join state is
/// observable.
///
/// A collapsed range inherits an explicit pending format or its focus-affinity
/// context. An extended range uses the first spatially selected run; a
/// text-empty structural range falls back to the surviving left seam, then the
/// right seam, then plain text. That one format set is applied to every
/// non-empty inserted paragraph. Success consumes pending formats, places a
/// before-affinity caret after the last inserted scalar and before retained
/// suffix text, and requests independent history. A session adds an undo entry
/// only when canonical execution retains a document operation; an exact
/// replacement can instead be a selection-only commit.
///
/// Evaluation is deterministic against the supplied snapshot. The operation's
/// complete paragraph guards make stale direct application or replay fail
/// closed. Unsupported schemas/selections and active resource limits disable
/// the action with stable reasons; impossible capture, coordinate, or fragment
/// invariants return stable [`ActionFault`] codes.
#[derive(Clone, Copy, Debug, Default)]
pub struct InsertPlainTextAction;

/// Validated, bounded input for [`InsertPlainTextAction`].
///
/// [`Self::text`] exposes the normalized value: all supported source newline
/// spellings are represented by LF. Debug output never reveals the text.
#[derive(Clone, Eq, PartialEq)]
pub struct InsertPlainTextInput {
    text: Arc<str>,
    utf16_length: u32,
    paragraph_count: u32,
}

impl InsertPlainTextInput {
    /// Validates and normalizes one non-empty plain-text input.
    ///
    /// Text and UTF-16 limits apply to the source value before CRLF
    /// normalization. Paragraph count applies to the normalized structural
    /// result.
    ///
    /// # Errors
    ///
    /// Returns [`InsertPlainTextInputError`] when the source is empty, exceeds
    /// either text-size bound, or would produce more than
    /// [`MAX_INSERT_PLAIN_TEXT_PARAGRAPHS`] paragraphs.
    pub fn try_new(text: impl AsRef<str>) -> Result<Self, InsertPlainTextInputError> {
        let source = text.as_ref();
        if source.is_empty() {
            return Err(InsertPlainTextInputError::Empty);
        }

        let text_bytes = u64::try_from(source.len()).unwrap_or(u64::MAX);
        if text_bytes > MAX_INSERT_PLAIN_TEXT_BYTES {
            return Err(InsertPlainTextInputError::TextBytes {
                actual: text_bytes,
                maximum: MAX_INSERT_PLAIN_TEXT_BYTES,
            });
        }

        let source_utf16 = u64::try_from(source.encode_utf16().count()).unwrap_or(u64::MAX);
        if source_utf16 > u64::from(MAX_INSERT_PLAIN_TEXT_UTF16_CODE_UNITS) {
            return Err(InsertPlainTextInputError::Utf16CodeUnits {
                actual: source_utf16,
                maximum: MAX_INSERT_PLAIN_TEXT_UTF16_CODE_UNITS,
            });
        }

        let paragraph_count = count_normalized_paragraphs(source);
        if paragraph_count > u64::from(MAX_INSERT_PLAIN_TEXT_PARAGRAPHS) {
            return Err(InsertPlainTextInputError::Paragraphs {
                actual: paragraph_count,
                maximum: MAX_INSERT_PLAIN_TEXT_PARAGRAPHS,
            });
        }
        let paragraph_count =
            u32::try_from(paragraph_count).map_err(|_| InsertPlainTextInputError::Paragraphs {
                actual: paragraph_count,
                maximum: MAX_INSERT_PLAIN_TEXT_PARAGRAPHS,
            })?;

        let text = normalize_line_endings(source);
        let normalized_utf16 = u64::try_from(text.encode_utf16().count()).unwrap_or(u64::MAX);
        let utf16_length = u32::try_from(normalized_utf16).map_err(|_| {
            InsertPlainTextInputError::Utf16CodeUnits {
                actual: normalized_utf16,
                maximum: MAX_INSERT_PLAIN_TEXT_UTF16_CODE_UNITS,
            }
        })?;

        Ok(Self { text, utf16_length, paragraph_count })
    }

    /// Returns the text with CRLF, lone CR, and LF represented by LF.
    #[must_use]
    pub fn text(&self) -> &str {
        &self.text
    }

    /// Returns the normalized UTF-8 byte length.
    #[must_use]
    pub fn text_bytes(&self) -> usize {
        self.text.len()
    }

    /// Returns the normalized UTF-16 code-unit length, including LF separators.
    #[must_use]
    pub const fn utf16_len(&self) -> u32 {
        self.utf16_length
    }

    /// Returns the number of structural replacement paragraphs.
    #[must_use]
    pub const fn paragraph_count(&self) -> u32 {
        self.paragraph_count
    }

    fn paragraphs(&self) -> impl DoubleEndedIterator<Item = &str> + Clone + '_ {
        self.text.split('\n')
    }
}

impl fmt::Debug for InsertPlainTextInput {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("InsertPlainTextInput")
            .field("text", &"<redacted>")
            .field("paragraph_count", &self.paragraph_count)
            .finish_non_exhaustive()
    }
}

/// Why a semantic plain-text insertion input cannot be constructed.
#[derive(Clone, Copy, Debug, Eq, Error, PartialEq)]
pub enum InsertPlainTextInputError {
    /// Inserted plain text must contain at least one Unicode scalar.
    #[error("insert-plain-text input cannot be empty")]
    Empty,
    /// The source input exceeds the fixed action-value string budget.
    #[error("insert-plain-text input uses {actual} UTF-8 bytes; the limit is {maximum}")]
    TextBytes {
        /// Actual source UTF-8 byte length.
        actual: u64,
        /// Maximum accepted source UTF-8 byte length.
        maximum: u64,
    },
    /// The source input exceeds the fixed UTF-16 coordinate budget.
    #[error("insert-plain-text input uses {actual} UTF-16 code units; the limit is {maximum}")]
    Utf16CodeUnits {
        /// Actual source UTF-16 code-unit length.
        actual: u64,
        /// Maximum accepted source UTF-16 code-unit length.
        maximum: u32,
    },
    /// Normalized input would create too many structural paragraphs.
    #[error("insert-plain-text input creates {actual} paragraphs; the limit is {maximum}")]
    Paragraphs {
        /// Actual normalized paragraph count.
        actual: u64,
        /// Maximum accepted normalized paragraph count.
        maximum: u32,
    },
}

impl DecodeActionInput for InsertPlainTextInput {
    fn decode(
        registered_contract: Option<&ActionInputContract>,
        input: &ActionInput,
    ) -> Result<Self, ActionInputError> {
        let Some(registered) = registered_contract else {
            return Err(ActionInputError::MissingRegisteredContract);
        };
        let expected = insert_plain_text_input_contract();
        if registered != &expected {
            return Err(ActionInputError::ContractMismatch {
                expected,
                actual: registered.clone(),
            });
        }
        let value = input.require_typed(registered)?;
        let text = value
            .as_string()
            .ok_or_else(|| invalid_input(INSERT_PLAIN_TEXT_INPUT_NOT_STRING_CODE))?;
        Self::try_new(text).map_err(|error| match error {
            InsertPlainTextInputError::Empty => invalid_input(INSERT_PLAIN_TEXT_EMPTY_INPUT_CODE),
            InsertPlainTextInputError::TextBytes { .. }
            | InsertPlainTextInputError::Utf16CodeUnits { .. } => {
                invalid_input(INSERT_PLAIN_TEXT_INPUT_LIMIT_CODE)
            }
            InsertPlainTextInputError::Paragraphs { .. } => {
                invalid_input(INSERT_PLAIN_TEXT_PARAGRAPH_LIMIT_CODE)
            }
        })
    }
}

impl TypedActionInput for InsertPlainTextInput {}

/// Returns the stable built-in plain-text insertion action identity.
#[must_use]
pub fn insert_plain_text_action_id() -> ActionId {
    ActionId::from_qualified_name(QualifiedName::from_known_static(INSERT_PLAIN_TEXT_ACTION_NAME))
}

/// Returns the exact typed-input contract accepted by [`InsertPlainTextAction`].
#[must_use]
pub fn insert_plain_text_input_contract() -> ActionInputContract {
    ActionInputContract::new(
        QualifiedName::from_known_static(INSERT_PLAIN_TEXT_INPUT_CONTRACT_NAME),
        INSERT_PLAIN_TEXT_INPUT_VERSION,
    )
}

impl Action for InsertPlainTextAction {
    type Input = InsertPlainTextInput;

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
        evaluate_insert_plain_text(state, input).map(ActionEvaluation::stateless)
    }
}

fn evaluate_insert_plain_text(
    state: &EditorState,
    input: &InsertPlainTextInput,
) -> Result<ActionDecision, ActionFault> {
    let range = match require_paragraph_structure_range(state)? {
        Ok(range) => range,
        Err(reason) => return Ok(ActionDecision::Disabled(reason)),
    };
    if let Some(decision) = require_operation_budget(state, 1) {
        return Ok(decision);
    }

    let source = capture_source(state, &range)?;
    let formats = insertion_formats(state, &range, &source)?;
    let replacement = match replacement_fragments(input, &formats) {
        Ok(replacement) => replacement,
        Err(ReplacementError::Capacity) => {
            return Ok(disabled("breditor/result-limit-exceeded"));
        }
        Err(ReplacementError::Invariant) => {
            return Err(fault("breditor/insert-plain-text-input-invariant-fault"));
        }
    };
    let Some(result) = derive_result(&source.prefix, &replacement, &source.suffix)? else {
        return Ok(disabled("breditor/result-limit-exceeded"));
    };
    let Some(result_text_bytes) =
        result.iter().try_fold(0_usize, |total, fragment| total.checked_add(fragment.text_bytes()))
    else {
        return Ok(disabled("breditor/result-limit-exceeded"));
    };
    let result_refs: Vec<_> = result.iter().collect();
    if !base_shape_fits(state, source.guards.len(), source.guard_run_count, &result_refs)
        || !base_total_text_fits(state, source.guard_text_bytes, result_text_bytes)
        || !property_fragment_delta_fits(
            state,
            source.guards.iter(),
            result.iter(),
            "breditor/insert-plain-text-property-validation-fault",
            "breditor/insert-plain-text-property-budget-fault",
        )?
    {
        return Ok(disabled("breditor/result-limit-exceeded"));
    }

    let selection = result_selection(&source.range, &replacement, &result)?;
    let operation = RootTextReplace::try_new(source.range, source.guards, replacement)
        .map_err(|_| fault("breditor/insert-plain-text-root-replace-fault"))?;

    Ok(ActionDecision::Enabled(ActionPlan::new(
        vec![Operation::from(operation)],
        strict_relocation(),
        SelectionUpdate::Set(Some(selection)),
        PendingFormatsUpdate::Set(None),
        HistoryIntent::Record,
    )))
}

struct CapturedSource {
    range: RootTextRange,
    guards: Vec<TextFragment>,
    prefix: TextFragment,
    suffix: TextFragment,
    first_selected_formats: Option<FormatSet>,
    guard_run_count: usize,
    guard_text_bytes: usize,
}

fn capture_source(
    state: &EditorState,
    range: &TextRangeSelection,
) -> Result<CapturedSource, ActionFault> {
    if range.is_same_paragraph() {
        return capture_same_paragraph_source(state, range);
    }

    let source = capture_cross_paragraph_text_source(state, range)
        .map_err(map_cross_paragraph_source_error)?;
    let prefix = source.prefix().clone();
    let suffix = source.suffix().clone();
    let first_selected_formats = source.first_selected_formats().cloned();
    let guard_run_count = source.guard_run_count();
    let guard_text_bytes = source.guard_text_bytes();
    let (operation_range, guards) = source.into_range_and_guards();
    let captured = CapturedSource {
        range: operation_range,
        guards,
        prefix,
        suffix,
        first_selected_formats,
        guard_run_count,
        guard_text_bytes,
    };
    Ok(captured)
}

fn capture_same_paragraph_source(
    state: &EditorState,
    range: &TextRangeSelection,
) -> Result<CapturedSource, ActionFault> {
    let paragraph_path = range.start().paragraph_path();
    let source = paragraph_fragment(state, paragraph_path, range.start().offset())?;
    let (prefix, selected, suffix) =
        fragment_range_parts(&source, range.start().offset(), range.end().offset())?;
    let operation_range = RootTextRange::try_new(
        RootTextBoundary::try_new(paragraph_path.clone(), range.start().offset())
            .map_err(|_| fault("breditor/insert-plain-text-root-range-fault"))?,
        RootTextBoundary::try_new(paragraph_path.clone(), range.end().offset())
            .map_err(|_| fault("breditor/insert-plain-text-root-range-fault"))?,
    )
    .map_err(|_| fault("breditor/insert-plain-text-root-range-fault"))?;
    let first_selected_formats = selected.iter().next().map(|run| run.formats().clone());
    let guard_run_count = source.len();
    let guard_text_bytes = source.text_bytes();
    Ok(CapturedSource {
        range: operation_range,
        guards: vec![source],
        prefix,
        suffix,
        first_selected_formats,
        guard_run_count,
        guard_text_bytes,
    })
}

fn insertion_formats(
    state: &EditorState,
    range: &TextRangeSelection,
    source: &CapturedSource,
) -> Result<FormatSet, ActionFault> {
    if range.is_collapsed() {
        let guard = source
            .guards
            .first()
            .ok_or_else(|| fault("breditor/insert-plain-text-source-fault"))?;
        return effective_typing_formats(
            state,
            guard,
            range.start().offset(),
            source_range(state)?.focus().affinity(),
        );
    }

    Ok(source
        .first_selected_formats
        .clone()
        .or_else(|| source.prefix.iter().next_back().map(|run| run.formats().clone()))
        .or_else(|| source.suffix.iter().next().map(|run| run.formats().clone()))
        .unwrap_or_default())
}

fn replacement_fragments(
    input: &InsertPlainTextInput,
    formats: &FormatSet,
) -> Result<Vec<TextFragment>, ReplacementError> {
    let capacity =
        usize::try_from(input.paragraph_count()).map_err(|_| ReplacementError::Capacity)?;
    let mut fragments = Vec::with_capacity(capacity);
    for paragraph in input.paragraphs() {
        if paragraph.is_empty() {
            fragments.push(TextFragment::empty());
            continue;
        }
        let run = match TextRun::try_new(paragraph.to_owned(), formats.clone()) {
            Ok(run) => run,
            Err(TextRunError::TooLong) => return Err(ReplacementError::Capacity),
            Err(TextRunError::Empty) => return Err(ReplacementError::Invariant),
        };
        fragments.push(TextFragment::from(run));
    }
    if fragments.len() != capacity || fragments.is_empty() {
        return Err(ReplacementError::Invariant);
    }
    Ok(fragments)
}

fn derive_result(
    prefix: &TextFragment,
    replacement: &[TextFragment],
    suffix: &TextFragment,
) -> Result<Option<Vec<TextFragment>>, ActionFault> {
    let Some((first, remaining)) = replacement.split_first() else {
        return Err(fault("breditor/insert-plain-text-input-invariant-fault"));
    };
    if remaining.is_empty() {
        let Some(with_prefix) = concat_result(prefix, first)? else {
            return Ok(None);
        };
        return concat_result(&with_prefix, suffix).map(|result| result.map(|value| vec![value]));
    }

    let Some((last, middle)) = remaining.split_last() else {
        return Err(fault("breditor/insert-plain-text-input-invariant-fault"));
    };
    let Some(first_result) = concat_result(prefix, first)? else {
        return Ok(None);
    };
    let Some(last_result) = concat_result(last, suffix)? else {
        return Ok(None);
    };
    let mut result = Vec::with_capacity(replacement.len());
    result.push(first_result);
    result.extend(middle.iter().cloned());
    result.push(last_result);
    Ok(Some(result))
}

fn concat_result(
    left: &TextFragment,
    right: &TextFragment,
) -> Result<Option<TextFragment>, ActionFault> {
    match left.try_concat(right) {
        Ok(result) => Ok(Some(result)),
        Err(error) if fragment_error_is_capacity(&error) => Ok(None),
        Err(_) => Err(fault("breditor/insert-plain-text-result-fold-fault")),
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

fn result_selection(
    range: &RootTextRange,
    replacement: &[TextFragment],
    result: &[TextFragment],
) -> Result<Selection, ActionFault> {
    let replacement_count = u32::try_from(replacement.len())
        .map_err(|_| fault("breditor/insert-plain-text-caret-path-fault"))?;
    let paragraph_delta = replacement_count
        .checked_sub(1)
        .ok_or_else(|| fault("breditor/insert-plain-text-input-invariant-fault"))?;
    let paragraph_index = range
        .start()
        .paragraph_index()
        .checked_add(paragraph_delta)
        .ok_or_else(|| fault("breditor/insert-plain-text-caret-path-fault"))?;
    let paragraph_path = NodePath::try_from_indices(vec![paragraph_index])
        .map_err(|_| fault("breditor/insert-plain-text-caret-path-fault"))?;
    let inserted_tail = replacement
        .last()
        .ok_or_else(|| fault("breditor/insert-plain-text-input-invariant-fault"))?
        .utf16_len();
    let caret_offset = if replacement.len() == 1 {
        range
            .start()
            .offset()
            .checked_add(inserted_tail.get())
            .map_err(|_| fault("breditor/insert-plain-text-caret-offset-fault"))?
    } else {
        inserted_tail
    };
    let result_paragraph =
        result.last().ok_or_else(|| fault("breditor/insert-plain-text-result-fold-fault"))?;
    collapsed_selection_at_with_affinity(
        &paragraph_path,
        result_paragraph,
        caret_offset,
        Affinity::Before,
    )
}

fn map_cross_paragraph_source_error(error: CrossParagraphTextSourceError) -> ActionFault {
    match error {
        CrossParagraphTextSourceError::Span => fault("breditor/insert-plain-text-cross-span-fault"),
        CrossParagraphTextSourceError::Range => {
            fault("breditor/insert-plain-text-root-range-fault")
        }
        CrossParagraphTextSourceError::Source => {
            fault("breditor/insert-plain-text-cross-source-fault")
        }
        CrossParagraphTextSourceError::Paragraph(fault) => fault,
    }
}

fn source_range(state: &EditorState) -> Result<&RangeSelection, ActionFault> {
    let Some(Selection::Range(range)) = state.selection() else {
        return Err(fault("breditor/insert-plain-text-selection-fault"));
    };
    Ok(range)
}

enum ReplacementError {
    Capacity,
    Invariant,
}

fn count_normalized_paragraphs(text: &str) -> u64 {
    let bytes = text.as_bytes();
    let mut index = 0_usize;
    let mut paragraphs = 1_u64;
    while index < bytes.len() {
        match bytes[index] {
            b'\r' => {
                paragraphs = paragraphs.saturating_add(1);
                index = if bytes.get(index + 1) == Some(&b'\n') {
                    index.saturating_add(2)
                } else {
                    index.saturating_add(1)
                };
            }
            b'\n' => {
                paragraphs = paragraphs.saturating_add(1);
                index = index.saturating_add(1);
            }
            _ => index = index.saturating_add(1),
        }
    }
    paragraphs
}

fn normalize_line_endings(text: &str) -> Arc<str> {
    if !text.contains('\r') {
        return Arc::from(text);
    }

    let mut normalized = String::with_capacity(text.len());
    let mut characters = text.chars().peekable();
    while let Some(character) = characters.next() {
        if character == '\r' {
            if characters.peek() == Some(&'\n') {
                characters.next();
            }
            normalized.push('\n');
        } else {
            normalized.push(character);
        }
    }
    Arc::from(normalized)
}

fn invalid_input(code: &'static str) -> ActionInputError {
    ActionInputError::InvalidValue { code: QualifiedName::from_known_static(code) }
}

#[cfg(test)]
mod tests {
    use super::{
        InsertPlainTextInput, InsertPlainTextInputError, MAX_INSERT_PLAIN_TEXT_PARAGRAPHS,
    };

    #[test]
    fn line_endings_normalize_without_touching_other_separators()
    -> Result<(), Box<dyn std::error::Error>> {
        let input = InsertPlainTextInput::try_new("a\r\nb\rc\nd\u{2028}e")?;
        assert_eq!(input.text(), "a\nb\nc\nd\u{2028}e");
        assert_eq!(input.paragraph_count(), 4);
        Ok(())
    }

    #[test]
    fn empty_structural_paragraphs_are_preserved() -> Result<(), Box<dyn std::error::Error>> {
        let input = InsertPlainTextInput::try_new("\r\n\n")?;
        assert_eq!(input.text(), "\n\n");
        assert_eq!(input.paragraph_count(), 3);
        assert_eq!(input.paragraphs().collect::<Vec<_>>(), vec!["", "", ""]);
        Ok(())
    }

    #[test]
    fn fixed_input_limits_reject_before_planning() {
        let too_many_bytes = "x".repeat(65_537);
        assert!(matches!(
            InsertPlainTextInput::try_new(too_many_bytes),
            Err(InsertPlainTextInputError::TextBytes { .. })
        ));

        let too_many_paragraphs = "\n".repeat(10_000);
        assert_eq!(
            InsertPlainTextInput::try_new(too_many_paragraphs),
            Err(InsertPlainTextInputError::Paragraphs {
                actual: u64::from(MAX_INSERT_PLAIN_TEXT_PARAGRAPHS) + 1,
                maximum: MAX_INSERT_PLAIN_TEXT_PARAGRAPHS,
            })
        );
    }
}
