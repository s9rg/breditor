//! Property-preservation contracts for property-free toggles in typed profiles.

mod support;

use std::error::Error;

use breditor_core::{
    action::{
        ActionActivation, ActionId, ActionInput, ActionInvocation, ActionPreparation,
        ActionStateBatch, ActionStateId, ActionStateOutcome, ActionValue, ObservedAvailability,
        ResolvedActionState,
        builtins::{insert_text_action_id, insert_text_input_contract, toggle_strong_action_id},
        routing::{BindingId, IntentId},
    },
    codec::{DocumentJsonCodecV2, SessionCheckpointJsonCodecV3},
    document::{Document, Format, FormatSet, PropertyMap, PropertyValue},
    extension::{
        ExtensionId, ExtensionLimits, ExtensionManifest, ExtensionSet, ExtensionVersion,
        InlineFormatPropertyContractV1, InlineFormatPropertySpecV1, InlineFormatPropertyTypeV1,
        InlineFormatSpecV1, InlineFormatToggleSpecV1, PropertyPresenceV1,
    },
    identity::QualifiedName,
    operation::{Operation, TextSplice},
    position::{Affinity, Point},
    profile::CompiledEditorProfile,
    schema::{CompiledSchema, DocumentLimits, PersistedTypeRevision, SchemaId, SchemaVersion},
    selection::{RangeSelection, Selection},
    session::EditorSession,
    state::{EditorContext, EditorState, LineageId},
};
use serde_json::{Value, json};
use support::{TestResult, path, test_error};

const STRONG: &str = "breditor/strong";
const HIGHLIGHT: &str = "example/highlight";
const LINK: &str = "example/link";
const HREF: &str = "example/href";
const OPEN_IN_NEW_WINDOW: &str = "example/open-in-new-window";
const HIGHLIGHT_ACTION: &str = "example/toggle-highlight";
const HIGHLIGHT_STATE: &str = "example/control-highlight";
const BOLD_STATE: &str = "breditor/control-bold";

type ExpectedRun<'a> = (&'a str, bool, bool, Option<(&'a str, bool)>);

fn name(value: &str) -> Result<QualifiedName, Box<dyn Error>> {
    QualifiedName::try_new(value).map_err(Into::into)
}

fn typed_profile() -> Result<CompiledEditorProfile, Box<dyn Error>> {
    let contract = InlineFormatPropertyContractV1::try_new(
        name(LINK)?,
        vec![
            InlineFormatPropertySpecV1::new(
                name(HREF)?,
                PropertyPresenceV1::Required,
                InlineFormatPropertyTypeV1::try_string(1, 2_048)?,
            ),
            InlineFormatPropertySpecV1::new(
                name(OPEN_IN_NEW_WINDOW)?,
                PropertyPresenceV1::Required,
                InlineFormatPropertyTypeV1::boolean(),
            ),
        ],
    )?;
    let manifest = ExtensionManifest::try_new_with_inline_format_declarations(
        ExtensionId::new(name("example/formatting-extension")?, ExtensionVersion::try_new(1)?),
        Vec::new(),
        Vec::new(),
        vec![
            InlineFormatSpecV1::new(name(HIGHLIGHT)?, PersistedTypeRevision::one()),
            InlineFormatSpecV1::new(name(LINK)?, PersistedTypeRevision::one()),
        ],
        vec![contract],
        vec![InlineFormatToggleSpecV1::new(
            name(HIGHLIGHT)?,
            action_id(HIGHLIGHT_ACTION)?,
            IntentId::try_new("example/format-highlight")?,
            BindingId::try_new("example/highlight-binding")?,
            state_id(HIGHLIGHT_STATE)?,
        )],
    )?;
    let extensions = ExtensionSet::try_new(vec![manifest], ExtensionLimits::default())?;
    CompiledEditorProfile::try_compile_base_text_profile(
        SchemaId::new(name("example/formatting-profile")?, SchemaVersion::try_new(1)?),
        extensions,
    )
    .map_err(Into::into)
}

fn action_id(value: &str) -> Result<ActionId, Box<dyn Error>> {
    ActionId::try_new(value).map_err(Into::into)
}

fn state_id(value: &str) -> Result<ActionStateId, Box<dyn Error>> {
    ActionStateId::try_new(value).map_err(Into::into)
}

fn format_value(kind: &str, properties: &Value) -> Value {
    json!({ "type": kind, "properties": properties })
}

fn run_value(text: &str, strong: bool, highlight: bool, link: Option<(&str, bool)>) -> Value {
    let mut formats = Vec::new();
    if strong {
        formats.push(format_value(STRONG, &json!({})));
    }
    if highlight {
        formats.push(format_value(HIGHLIGHT, &json!({})));
    }
    if let Some((href, open_in_new_window)) = link {
        formats.push(format_value(
            LINK,
            &json!({
                (HREF): href,
                (OPEN_IN_NEW_WINDOW): open_in_new_window,
            }),
        ));
    }
    json!({ "kind": "text", "text": text, "formats": formats })
}

fn paragraph_value(runs: &[Value]) -> Value {
    json!({
        "kind": "element",
        "type": "breditor/paragraph",
        "entityId": null,
        "properties": {},
        "children": runs,
    })
}

fn document_json(schema: &CompiledSchema, paragraphs: &[Value]) -> String {
    json!({
        "format": "breditor/document",
        "formatVersion": 2,
        "schema": {
            "name": schema.id().name().as_str(),
            "version": schema.id().version().get(),
        },
        "schemaFingerprint": schema.fingerprint().to_string(),
        "root": {
            "kind": "element",
            "type": "breditor/document",
            "entityId": null,
            "properties": {},
            "children": paragraphs,
        },
    })
    .to_string()
}

fn state(
    context: &EditorContext,
    paragraphs: &[Value],
    selection: Selection,
    lineage: &str,
) -> Result<EditorState, Box<dyn Error>> {
    let document = DocumentJsonCodecV2::new(context.schema().clone())
        .with_limits(context.limits().clone())
        .decode(&document_json(context.schema(), paragraphs))?;
    EditorState::try_new(context, LineageId::try_new(lineage)?, document, Some(selection), None)
        .map_err(Into::into)
}

fn text_point(run: u32, offset: u32, affinity: Affinity) -> Result<Point, Box<dyn Error>> {
    Ok(Point::Text { text_path: path(&[0, run])?, utf16_offset: offset, affinity })
}

fn paragraph_text_point(
    paragraph: u32,
    run: u32,
    offset: u32,
    affinity: Affinity,
) -> Result<Point, Box<dyn Error>> {
    Ok(Point::Text { text_path: path(&[paragraph, run])?, utf16_offset: offset, affinity })
}

fn collapsed(point: Point) -> Selection {
    RangeSelection::new(point.clone(), point).into()
}

fn selected(anchor: Point, focus: Point) -> Selection {
    RangeSelection::new(anchor, focus).into()
}

fn without_input(id: &ActionId) -> ActionInvocation {
    ActionInvocation::without_input(id.clone())
}

fn insert_invocation(text: &str) -> Result<ActionInvocation, Box<dyn Error>> {
    Ok(ActionInvocation::new(
        insert_text_action_id(),
        ActionInput::typed(insert_text_input_contract(), ActionValue::try_from_string(text)?),
    ))
}

fn resolved<'a>(
    batch: &'a ActionStateBatch,
    id: &ActionStateId,
) -> Result<&'a ResolvedActionState, Box<dyn Error>> {
    let entry = batch.entry(id).ok_or_else(|| test_error(format!("missing entry {id}")))?;
    match entry.outcome() {
        ActionStateOutcome::Resolved(outcome) => Ok(outcome),
        other => Err(test_error(format!("entry {id} was not resolved: {other:?}")).into()),
    }
}

fn expected_formats(
    strong: bool,
    highlight: bool,
    link: Option<(&str, bool)>,
) -> Result<FormatSet, Box<dyn Error>> {
    let mut formats = Vec::new();
    if strong {
        formats.push(Format::new(name(STRONG)?, PropertyMap::default()));
    }
    if highlight {
        formats.push(Format::new(name(HIGHLIGHT)?, PropertyMap::default()));
    }
    if let Some((href, open_in_new_window)) = link {
        formats.push(Format::new(
            name(LINK)?,
            PropertyMap::try_from_sorted(vec![
                (name(HREF)?, PropertyValue::from_string(href)),
                (name(OPEN_IN_NEW_WINDOW)?, PropertyValue::boolean(open_in_new_window)),
            ])?,
        ));
    }
    FormatSet::try_from_formats(formats).map_err(Into::into)
}

fn assert_runs(document: &Document, expected: &[ExpectedRun<'_>]) -> TestResult {
    let paragraph = document
        .root()
        .as_element()
        .and_then(|root| root.children().get(0))
        .and_then(breditor_core::document::NodeRef::as_element)
        .ok_or_else(|| test_error("first paragraph is missing"))?;
    assert_eq!(paragraph.children().len(), expected.len());
    for (child, (text, strong, highlight, link)) in paragraph.children().iter().zip(expected) {
        let run = child.as_text().ok_or_else(|| test_error("paragraph child was not text"))?;
        assert_eq!(run.text(), *text);
        assert_eq!(run.formats(), &expected_formats(*strong, *highlight, *link)?);
    }
    Ok(())
}

fn only_splice(operations: &[Operation]) -> Result<&TextSplice, Box<dyn Error>> {
    let [Operation::TextSplice(splice)] = operations else {
        return Err(test_error(format!("expected one TextSplice, got {operations:?}")).into());
    };
    Ok(splice)
}

#[test]
fn collapsed_states_toggles_typing_and_replay_preserve_the_exact_typed_peer() -> TestResult {
    let profile = typed_profile()?;
    let context = profile.editor_context(DocumentLimits::default());
    let registry = profile.action_registry();
    let highlight_id = action_id(HIGHLIGHT_ACTION)?;
    let strong_id = toggle_strong_action_id();
    let initial = state(
        &context,
        &[paragraph_value(&[run_value(
            "ab",
            false,
            false,
            Some(("https://example.test/a", true)),
        )])],
        collapsed(text_point(0, 1, Affinity::After)?),
        "typed-toggle-collapsed-replay",
    )?;
    let initial_copy = initial.clone();
    let highlight_state_id = state_id(HIGHLIGHT_STATE)?;
    let strong_state_id = state_id(BOLD_STATE)?;
    let catalog = profile.action_state_catalog();
    let mut session = EditorSession::new(initial);

    let initial_states = catalog.derive(&session)?;
    for id in [&highlight_state_id, &strong_state_id] {
        let state = resolved(&initial_states, id)?;
        assert!(matches!(state.availability(), ObservedAvailability::Enabled));
        assert_eq!(state.indicator().activation(), ActionActivation::Inactive);
    }

    let highlight_preparation = registry.prepare(session.state(), &without_input(&highlight_id))?;
    let ActionPreparation::Enabled(highlight) = &highlight_preparation else {
        return Err(test_error("collapsed highlight toggle was disabled").into());
    };
    assert!(highlight.transaction().operations().is_empty());
    session.execute_prepared_action(highlight_preparation)?;
    assert_eq!(
        session.state().pending_formats(),
        Some(&expected_formats(false, true, Some(("https://example.test/a", true)))?)
    );
    assert_eq!(
        resolved(&catalog.derive(&session)?, &highlight_state_id)?.indicator().activation(),
        ActionActivation::Active
    );

    let strong_preparation = registry.prepare(session.state(), &without_input(&strong_id))?;
    let ActionPreparation::Enabled(strong) = &strong_preparation else {
        return Err(test_error("collapsed strong toggle was disabled").into());
    };
    assert!(strong.transaction().operations().is_empty());
    session.execute_prepared_action(strong_preparation)?;
    let pending_both = expected_formats(true, true, Some(("https://example.test/a", true)))?;
    assert_eq!(session.state().pending_formats(), Some(&pending_both));

    let inserted = registry.prepare(session.state(), &insert_invocation("X")?)?;
    let ActionPreparation::Enabled(inserted_plan) = &inserted else {
        return Err(test_error("typing with typed pending formats was disabled").into());
    };
    only_splice(inserted_plan.transaction().operations())?;
    session.execute_prepared_action(inserted)?;
    assert_runs(
        session.state().document(),
        &[
            ("a", false, false, Some(("https://example.test/a", true))),
            ("X", true, true, Some(("https://example.test/a", true))),
            ("b", false, false, Some(("https://example.test/a", true))),
        ],
    )?;
    assert_eq!(session.state().pending_formats(), None);
    let final_state = session.state().clone();

    let Some(first_undo) = session.undo()? else {
        return Err(test_error("typed insertion was not undoable").into());
    };
    assert_eq!(first_undo.after().document(), initial_copy.document());
    assert_eq!(first_undo.after().pending_formats(), Some(&pending_both));
    assert_eq!(first_undo.after().selection(), initial_copy.selection());
    // Pending-format-only publications deliberately do not consume linear
    // history. The insertion boundary nevertheless owns and restores the exact
    // typed pending state that it consumed.
    assert!(session.undo()?.is_none());

    if session.redo()?.is_none() {
        return Err(test_error("typed insertion was not redoable").into());
    }
    assert_eq!(session.state().document(), final_state.document());
    assert_eq!(session.state().selection(), final_state.selection());
    assert_eq!(session.state().pending_formats(), final_state.pending_formats());
    Ok(())
}

#[test]
fn extended_toggle_preserves_properties_exactly_and_replays_the_guarded_splice() -> TestResult {
    let profile = typed_profile()?;
    let context = profile.editor_context(DocumentLimits::default());
    let registry = profile.action_registry();
    let highlight_id = action_id(HIGHLIGHT_ACTION)?;
    let strong_id = toggle_strong_action_id();
    let initial = state(
        &context,
        &[paragraph_value(&[run_value(
            "abc",
            false,
            false,
            Some(("https://example.test/exact", false)),
        )])],
        selected(text_point(0, 1, Affinity::Before)?, text_point(0, 2, Affinity::After)?),
        "typed-toggle-extended-replay",
    )?;
    let initial_copy = initial.clone();
    let highlight_state_id = state_id(HIGHLIGHT_STATE)?;
    let bold_state_id = state_id(BOLD_STATE)?;
    let catalog = profile.action_state_catalog();
    let mut session = EditorSession::new(initial);
    let observed = catalog.derive(&session)?;
    for id in [&highlight_state_id, &bold_state_id] {
        let state = resolved(&observed, id)?;
        assert!(matches!(state.availability(), ObservedAvailability::Enabled));
        assert_eq!(state.indicator().activation(), ActionActivation::Inactive);
    }

    let prepared = registry.prepare(session.state(), &without_input(&highlight_id))?;
    let ActionPreparation::Enabled(plan) = &prepared else {
        return Err(test_error("property-preserving extended toggle was disabled").into());
    };
    let splice = only_splice(plan.transaction().operations())?;
    assert_eq!(
        splice
            .replacement()
            .iter()
            .next()
            .ok_or_else(|| test_error("toggle replacement was empty"))?
            .formats(),
        &expected_formats(false, true, Some(("https://example.test/exact", false)))?
    );
    session.execute_prepared_action(prepared)?;
    assert_runs(
        session.state().document(),
        &[
            ("a", false, false, Some(("https://example.test/exact", false))),
            ("b", false, true, Some(("https://example.test/exact", false))),
            ("c", false, false, Some(("https://example.test/exact", false))),
        ],
    )?;
    assert_eq!(
        resolved(&catalog.derive(&session)?, &highlight_state_id)?.indicator().activation(),
        ActionActivation::Active
    );
    let highlighted_state = session.state().clone();

    let strong = registry.prepare(session.state(), &without_input(&strong_id))?;
    let ActionPreparation::Enabled(strong_plan) = &strong else {
        return Err(test_error("property-preserving Bold toggle was disabled").into());
    };
    only_splice(strong_plan.transaction().operations())?;
    session.execute_prepared_action(strong)?;
    assert_runs(
        session.state().document(),
        &[
            ("a", false, false, Some(("https://example.test/exact", false))),
            ("b", true, true, Some(("https://example.test/exact", false))),
            ("c", false, false, Some(("https://example.test/exact", false))),
        ],
    )?;
    assert_eq!(
        resolved(&catalog.derive(&session)?, &bold_state_id)?.indicator().activation(),
        ActionActivation::Active
    );
    let final_state = session.state().clone();

    let Some(strong_undo) = session.undo()? else {
        return Err(test_error("typed Bold toggle was not undoable").into());
    };
    assert_eq!(strong_undo.after().document(), highlighted_state.document());
    assert_eq!(strong_undo.after().selection(), highlighted_state.selection());
    let Some(highlight_undo) = session.undo()? else {
        return Err(test_error("typed Highlight toggle was not undoable").into());
    };
    assert_eq!(highlight_undo.after().document(), initial_copy.document());
    assert_eq!(highlight_undo.after().selection(), initial_copy.selection());
    for label in ["Highlight", "Bold"] {
        if session.redo()?.is_none() {
            return Err(test_error(format!("typed {label} toggle was not redoable")).into());
        }
    }
    assert_eq!(session.state().document(), final_state.document());
    assert_eq!(session.state().selection(), final_state.selection());
    Ok(())
}

#[test]
fn action_generated_typed_toggle_round_trips_v3_checkpoint_and_replays_exactly() -> TestResult {
    let profile = typed_profile()?;
    let context = profile.editor_context(DocumentLimits::default());
    let registry = profile.action_registry();
    let highlight_id = action_id(HIGHLIGHT_ACTION)?;
    let href = "https://example.test/checkpoint";
    let initial = state(
        &context,
        &[paragraph_value(&[run_value("abc", false, false, Some((href, true)))])],
        selected(text_point(0, 1, Affinity::Before)?, text_point(0, 2, Affinity::After)?),
        "typed-toggle-v3-checkpoint",
    )?;
    let initial_copy = initial.clone();
    let mut session = EditorSession::new(initial);

    let preparation = registry.prepare(session.state(), &without_input(&highlight_id))?;
    let ActionPreparation::Enabled(plan) = &preparation else {
        return Err(test_error("typed toggle for checkpoint proof was disabled").into());
    };
    only_splice(plan.transaction().operations())?;
    session.execute_prepared_action(preparation)?;
    let toggled = session.state().clone();
    assert_eq!(session.undo_depth(), 1);
    assert_eq!(session.redo_depth(), 0);

    let codec = SessionCheckpointJsonCodecV3::new(context);
    let encoded = codec.encode(&session)?;
    let encoded_value: Value = serde_json::from_str(&encoded)?;
    let operation = encoded_value
        .pointer("/entries/0/forwardOperations/0")
        .ok_or_else(|| test_error("checkpoint omitted the generated forward operation"))?;
    assert_eq!(operation["kind"], json!("textSplice"));
    assert_eq!(
        operation["expectedRemoved"]["runs"][0]["formats"][0]["properties"][HREF],
        json!(href)
    );
    assert_eq!(
        operation["expectedRemoved"]["runs"][0]["formats"][0]["properties"][OPEN_IN_NEW_WINDOW],
        json!(true)
    );
    assert_eq!(operation["replacement"]["runs"][0]["formats"][0]["type"], json!(HIGHLIGHT));
    assert_eq!(operation["replacement"]["runs"][0]["formats"][1]["properties"][HREF], json!(href));
    assert_eq!(
        operation["replacement"]["runs"][0]["formats"][1]["properties"][OPEN_IN_NEW_WINDOW],
        json!(true)
    );

    let mut restored = codec.decode(&encoded)?;
    assert_eq!(restored.state(), session.state());
    assert_eq!(restored.undo_depth(), 1);
    assert_eq!(restored.redo_depth(), 0);

    let Some(undo) = restored.undo()? else {
        return Err(test_error("restored typed toggle was not undoable").into());
    };
    assert_eq!(undo.after().document(), initial_copy.document());
    assert_eq!(undo.after().selection(), initial_copy.selection());
    assert_eq!(undo.after().pending_formats(), initial_copy.pending_formats());
    assert_eq!(restored.undo_depth(), 0);
    assert_eq!(restored.redo_depth(), 1);

    let Some(redo) = restored.redo()? else {
        return Err(test_error("restored typed toggle was not redoable").into());
    };
    assert_eq!(redo.after().document(), toggled.document());
    assert_eq!(redo.after().selection(), toggled.selection());
    assert_eq!(redo.after().pending_formats(), toggled.pending_formats());
    assert_eq!(restored.undo_depth(), 1);
    assert_eq!(restored.redo_depth(), 0);
    Ok(())
}

#[test]
fn typed_toggle_property_string_owner_budget_accepts_exact_and_rejects_first_excess() -> TestResult
{
    let profile = typed_profile()?;
    let registry = profile.action_registry();
    let highlight_id = action_id(HIGHLIGHT_ACTION)?;
    let href = "éx";
    let exact_string_bytes = href
        .len()
        .checked_mul(3)
        .ok_or_else(|| test_error("property-string fixture length overflowed"))?;
    let first_excess_limit = exact_string_bytes
        .checked_sub(1)
        .ok_or_else(|| test_error("property-string fixture must be nonempty"))?;
    let selection =
        selected(text_point(0, 1, Affinity::Before)?, text_point(0, 2, Affinity::After)?);

    // Selecting the middle scalar splits one typed owner into three. The exact
    // ceiling must admit all three UTF-8 string values.
    let exact_context = profile.editor_context(
        DocumentLimits::default().with_max_total_property_string_bytes(exact_string_bytes),
    );
    let exact = state(
        &exact_context,
        &[paragraph_value(&[run_value("abc", false, false, Some((href, true)))])],
        selection.clone(),
        "typed-toggle-property-string-exact",
    )?;
    assert_eq!(
        exact.document().summary().total_property_string_bytes(),
        u64::try_from(href.len())?
    );
    let exact_preparation = registry.prepare(&exact, &without_input(&highlight_id))?;
    let ActionPreparation::Enabled(exact_plan) = &exact_preparation else {
        return Err(test_error("exact property-string owner budget was disabled").into());
    };
    only_splice(exact_plan.transaction().operations())?;
    let exact_commit = exact_preparation.execute(&exact)?;
    assert_eq!(
        exact_commit.after().document().summary().total_property_string_bytes(),
        u64::try_from(exact_string_bytes)?
    );
    assert_runs(
        exact_commit.after().document(),
        &[
            ("a", false, false, Some((href, true))),
            ("b", false, true, Some((href, true))),
            ("c", false, false, Some((href, true))),
        ],
    )?;

    // One byte below that exact result must fail during action planning rather
    // than reaching operation application or partially publishing a document.
    let tight_context = profile.editor_context(
        DocumentLimits::default().with_max_total_property_string_bytes(first_excess_limit),
    );
    let tight = state(
        &tight_context,
        &[paragraph_value(&[run_value("abc", false, false, Some((href, true)))])],
        selection,
        "typed-toggle-property-string-first-excess",
    )?;
    let ActionPreparation::Disabled(tight_preparation) =
        registry.prepare(&tight, &without_input(&highlight_id))?
    else {
        return Err(test_error("first-excess property-string owner budget was admitted").into());
    };
    assert_eq!(tight_preparation.reason().code().as_str(), "breditor/result-limit-exceeded");
    Ok(())
}

#[test]
fn same_paragraph_range_typing_inherits_the_first_exact_typed_format_and_replays() -> TestResult {
    let profile = typed_profile()?;
    let context = profile.editor_context(DocumentLimits::default());
    let registry = profile.action_registry();
    let initial = state(
        &context,
        &[paragraph_value(&[
            run_value("ab", false, true, Some(("https://example.test/first", false))),
            run_value("CD", false, false, Some(("https://example.test/second", true))),
        ])],
        selected(text_point(0, 1, Affinity::Before)?, text_point(1, 1, Affinity::After)?),
        "typed-range-insert-replay",
    )?;
    let initial_copy = initial.clone();
    let mut session = EditorSession::new(initial);

    let preparation = registry.prepare(session.state(), &insert_invocation("X")?)?;
    let ActionPreparation::Enabled(plan) = &preparation else {
        return Err(test_error("same-paragraph typed range insertion was disabled").into());
    };
    let splice = only_splice(plan.transaction().operations())?;
    assert_eq!(
        splice
            .replacement()
            .iter()
            .next()
            .ok_or_else(|| test_error("range insertion replacement was empty"))?
            .formats(),
        &expected_formats(false, true, Some(("https://example.test/first", false)))?
    );
    session.execute_prepared_action(preparation)?;
    assert_runs(
        session.state().document(),
        &[
            ("aX", false, true, Some(("https://example.test/first", false))),
            ("D", false, false, Some(("https://example.test/second", true))),
        ],
    )?;
    let final_state = session.state().clone();

    let Some(undo) = session.undo()? else {
        return Err(test_error("same-paragraph typed range insertion was not undoable").into());
    };
    assert_eq!(undo.after().document(), initial_copy.document());
    assert_eq!(undo.after().selection(), initial_copy.selection());
    let Some(redo) = session.redo()? else {
        return Err(test_error("same-paragraph typed range insertion was not redoable").into());
    };
    assert_eq!(redo.after().document(), final_state.document());
    assert_eq!(redo.after().selection(), final_state.selection());
    Ok(())
}

#[test]
fn typed_toggle_reports_capacity_and_structural_boundaries_as_stable_disabled_states() -> TestResult
{
    let profile = typed_profile()?;
    let registry = profile.action_registry();
    let highlight_id = action_id(HIGHLIGHT_ACTION)?;
    let observable_id = state_id(HIGHLIGHT_STATE)?;
    let catalog = profile.action_state_catalog();

    // One typed link owns exactly two property values. Highlighting its middle
    // scalar would split it into three typed owners and therefore require six.
    let limited_context =
        profile.editor_context(DocumentLimits::default().with_max_property_values(2));
    let limited = state(
        &limited_context,
        &[paragraph_value(&[run_value(
            "abc",
            false,
            false,
            Some(("https://example.test/limit", true)),
        )])],
        selected(text_point(0, 1, Affinity::Before)?, text_point(0, 2, Affinity::After)?),
        "typed-toggle-property-limit",
    )?;
    let ActionPreparation::Disabled(limited_preparation) =
        registry.prepare(&limited, &without_input(&highlight_id))?
    else {
        return Err(test_error("property-owner split did not disable preparation").into());
    };
    assert_eq!(limited_preparation.reason().code().as_str(), "breditor/result-limit-exceeded");
    let limited_state = catalog.derive(&EditorSession::new(limited))?;
    let limited_state = resolved(&limited_state, &observable_id)?;
    let ObservedAvailability::Blocked(reason) = limited_state.availability() else {
        return Err(test_error("generated route did not publish its disabled preparation").into());
    };
    assert_eq!(reason.code().as_str(), "breditor/result-limit-exceeded");
    assert_eq!(limited_state.indicator().activation(), ActionActivation::Inactive);

    let cross_context = profile.editor_context(DocumentLimits::default());
    let cross = state(
        &cross_context,
        &[
            paragraph_value(&[run_value(
                "a",
                false,
                false,
                Some(("https://example.test/left", false)),
            )]),
            paragraph_value(&[run_value(
                "b",
                false,
                false,
                Some(("https://example.test/right", true)),
            )]),
        ],
        selected(
            paragraph_text_point(0, 0, 0, Affinity::Before)?,
            paragraph_text_point(1, 0, 1, Affinity::After)?,
        ),
        "typed-toggle-cross-paragraph",
    )?;
    let ActionPreparation::Disabled(cross_preparation) =
        registry.prepare(&cross, &without_input(&highlight_id))?
    else {
        return Err(test_error("typed cross-paragraph toggle did not disable preparation").into());
    };
    assert_eq!(cross_preparation.reason().code().as_str(), "breditor/unsupported-schema");
    let cross_state = catalog.derive(&EditorSession::new(cross))?;
    let cross_state = resolved(&cross_state, &observable_id)?;
    let ObservedAvailability::Blocked(reason) = cross_state.availability() else {
        return Err(test_error("typed cross-paragraph toggle did not fail closed").into());
    };
    assert_eq!(reason.code().as_str(), "breditor/unsupported-schema");
    assert_eq!(cross_state.indicator().activation(), ActionActivation::Inactive);
    Ok(())
}
