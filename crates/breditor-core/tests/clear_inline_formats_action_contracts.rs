//! Black-box contracts for the built-in clear-inline-formats command.

mod support;

use std::error::Error;

use breditor_core::{
    action::{
        ActionActivation, ActionActivationContract, ActionId, ActionInvocation, ActionPreparation,
        ActionRegistry, ActionStateId, ActionStateOutcome, ActionStateSource, ActionStateValue,
        ObservedAvailability, PreparedAction,
        builtins::{ClearInlineFormatsAction, clear_inline_formats_action_id},
        routing::{BindingId, BindingPriority, DisabledRouting, IntentId},
    },
    codec::DocumentJsonCodecV2,
    document::{Document, Format, FormatSet, PropertyMap, PropertyValue},
    extension::{
        ExtensionId, ExtensionLimits, ExtensionManifest, ExtensionSet, ExtensionVersion,
        InlineFormatPropertyContractV1, InlineFormatPropertySpecV1, InlineFormatPropertyTypeV1,
        InlineFormatSpecV1, PropertyPresenceV1,
    },
    identity::QualifiedName,
    operation::{Operation, RootTextReplace, TextSplice},
    position::{Affinity, Point},
    profile::{CompiledEditorProfile, CompiledProfileActionStateSource},
    schema::{DocumentLimits, PersistedTypeRevision, SchemaId, SchemaVersion},
    selection::{RangeOrder, RangeSelection, Selection},
    session::EditorSession,
    state::{EditorState, LineageId},
    transaction::{HistoryIntent, PendingFormatsUpdate, SelectionUpdate},
};
use serde_json::{Value, json};
use support::{TestResult, path, test_error};

const CLEAR_ACTION: &str = "breditor/clear-inline-formats";
const CLEAR_INTENT: &str = "breditor/clear-inline-formatting";
const CLEAR_BINDING: &str = "breditor/clear-inline-formatting-binding";
const CLEAR_STATE: &str = "breditor/control-clear-inline-formatting";
const STRONG: &str = "breditor/strong";
const LINK: &str = "example/link";
const HREF: &str = "example/href";
const LABEL: &str = "example/label";

#[derive(Clone, Copy, Debug)]
struct Run<'a> {
    text: &'a str,
    strong: bool,
    href: Option<&'a str>,
    label: Option<&'a str>,
}

impl<'a> Run<'a> {
    const fn plain(text: &'a str) -> Self {
        Self { text, strong: false, href: None, label: None }
    }

    const fn strong(text: &'a str) -> Self {
        Self { text, strong: true, href: None, label: None }
    }

    const fn linked(text: &'a str, href: &'a str) -> Self {
        Self { text, strong: false, href: Some(href), label: None }
    }

    const fn with_label(mut self, label: &'a str) -> Self {
        self.label = Some(label);
        self
    }

    const fn with_strong(mut self) -> Self {
        self.strong = true;
        self
    }
}

fn name(value: &str) -> Result<QualifiedName, Box<dyn Error>> {
    QualifiedName::try_new(value).map_err(Into::into)
}

fn typed_extensions() -> Result<ExtensionSet, Box<dyn Error>> {
    let link_contract = InlineFormatPropertyContractV1::try_new(
        name(LINK)?,
        vec![
            InlineFormatPropertySpecV1::new(
                name(HREF)?,
                PropertyPresenceV1::Required,
                InlineFormatPropertyTypeV1::try_string(1, 2_048)?,
            ),
            InlineFormatPropertySpecV1::new(
                name(LABEL)?,
                PropertyPresenceV1::Optional,
                InlineFormatPropertyTypeV1::try_string(0, 128)?,
            ),
        ],
    )?;
    let manifest = ExtensionManifest::try_new_with_inline_formats_and_property_contracts(
        ExtensionId::new(name("example/clear-extension")?, ExtensionVersion::one()),
        Vec::new(),
        Vec::new(),
        vec![InlineFormatSpecV1::new(name(LINK)?, PersistedTypeRevision::one())],
        vec![link_contract],
    )?;
    ExtensionSet::try_new(vec![manifest], ExtensionLimits::default()).map_err(Into::into)
}

fn typed_profile() -> Result<CompiledEditorProfile, Box<dyn Error>> {
    CompiledEditorProfile::try_compile_base_text_profile(
        SchemaId::new(name("example/clear-profile")?, SchemaVersion::try_new(1)?),
        typed_extensions()?,
    )
    .map_err(Into::into)
}

fn format_value(kind: &str, properties: &Value) -> Value {
    json!({ "type": kind, "properties": properties })
}

fn run_value(run: Run<'_>) -> Value {
    let mut formats = Vec::new();
    if run.strong {
        formats.push(format_value(STRONG, &json!({})));
    }
    if let Some(href) = run.href {
        let mut properties = serde_json::Map::new();
        properties.insert(HREF.to_owned(), json!(href));
        if let Some(label) = run.label {
            properties.insert(LABEL.to_owned(), json!(label));
        }
        formats.push(format_value(LINK, &Value::Object(properties)));
    }
    json!({ "kind": "text", "text": run.text, "formats": formats })
}

fn paragraph_value(runs: &[Run<'_>]) -> Value {
    json!({
        "kind": "element",
        "type": "breditor/paragraph",
        "entityId": null,
        "properties": {},
        "children": runs.iter().copied().map(run_value).collect::<Vec<_>>(),
    })
}

fn document_json(profile: &CompiledEditorProfile, paragraphs: &[Value]) -> String {
    json!({
        "format": "breditor/document",
        "formatVersion": 2,
        "schema": {
            "name": profile.schema().id().name().as_str(),
            "version": profile.schema().id().version().get(),
        },
        "schemaFingerprint": profile.schema().fingerprint().to_string(),
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
    profile: &CompiledEditorProfile,
    limits: DocumentLimits,
    paragraphs: &[Value],
    selection: Selection,
    pending_formats: Option<FormatSet>,
    lineage: &str,
) -> Result<EditorState, Box<dyn Error>> {
    let context = profile.editor_context(limits);
    let document = DocumentJsonCodecV2::new(profile.schema().clone())
        .with_limits(context.limits().clone())
        .decode(&document_json(profile, paragraphs))?;
    EditorState::try_new(
        &context,
        LineageId::try_new(lineage)?,
        document,
        Some(selection),
        pending_formats,
    )
    .map_err(Into::into)
}

fn text_point(
    paragraph: u32,
    run: u32,
    offset: u32,
    affinity: Affinity,
) -> Result<Point, Box<dyn Error>> {
    Ok(Point::Text { text_path: path(&[paragraph, run])?, utf16_offset: offset, affinity })
}

fn child_point(paragraph: u32, child: u32, affinity: Affinity) -> Result<Point, Box<dyn Error>> {
    Ok(Point::Children { parent_path: path(&[paragraph])?, child_index: child, affinity })
}

fn selected(anchor: Point, focus: Point) -> Selection {
    RangeSelection::new(anchor, focus).into()
}

fn collapsed(point: Point) -> Selection {
    selected(point.clone(), point)
}

fn formats(run: Run<'_>) -> Result<FormatSet, Box<dyn Error>> {
    let mut values = Vec::new();
    if run.strong {
        values.push(Format::new(name(STRONG)?, PropertyMap::default()));
    }
    if let Some(href) = run.href {
        let mut properties = vec![(name(HREF)?, PropertyValue::from_string(href))];
        if let Some(label) = run.label {
            properties.push((name(LABEL)?, PropertyValue::from_string(label)));
        }
        values.push(Format::new(name(LINK)?, PropertyMap::try_from_sorted(properties)?));
    }
    FormatSet::try_from_formats(values).map_err(Into::into)
}

fn prepare(
    registry: &ActionRegistry,
    state: &EditorState,
) -> Result<ActionPreparation, Box<dyn Error>> {
    registry
        .prepare(state, &ActionInvocation::without_input(clear_inline_formats_action_id()))
        .map_err(Into::into)
}

fn enabled(
    registry: &ActionRegistry,
    state: &EditorState,
) -> Result<PreparedAction, Box<dyn Error>> {
    match prepare(registry, state)? {
        ActionPreparation::Enabled(prepared) => Ok(prepared),
        ActionPreparation::Disabled(prepared) => Err(test_error(format!(
            "clear-inline-formats unexpectedly disabled: {}",
            prepared.reason().code()
        ))
        .into()),
    }
}

fn assert_disabled(
    registry: &ActionRegistry,
    state: &EditorState,
    expected_code: &str,
) -> TestResult {
    let original = state.clone();
    let ActionPreparation::Disabled(prepared) = prepare(registry, state)? else {
        return Err(test_error(format!("expected disabled reason {expected_code}")).into());
    };
    assert_eq!(prepared.reason().code().as_str(), expected_code);
    assert_eq!(prepared.reason().detail(), None);
    assert_eq!(prepared.indicator().activation(), ActionActivation::Stateless);
    assert_eq!(prepared.indicator().value(), &ActionStateValue::Unsupported);
    assert_eq!(prepared.base_state(), state);
    assert_eq!(state, &original);
    Ok(())
}

fn assert_paragraph_runs(
    document: &Document,
    paragraph_index: usize,
    expected: &[Run<'_>],
) -> TestResult {
    let paragraph = document
        .root()
        .as_element()
        .and_then(|root| root.children().get(paragraph_index))
        .and_then(breditor_core::document::NodeRef::as_element)
        .ok_or_else(|| test_error(format!("paragraph {paragraph_index} is missing")))?;
    assert_eq!(paragraph.children().len(), expected.len());
    for (child, expected) in paragraph.children().iter().zip(expected) {
        let actual = child.as_text().ok_or_else(|| test_error("paragraph child was not text"))?;
        assert_eq!(actual.text(), expected.text);
        assert_eq!(actual.formats(), &formats(*expected)?);
    }
    Ok(())
}

fn assert_selection(
    state: &EditorState,
    anchor: &Point,
    focus: &Point,
    order: RangeOrder,
) -> TestResult {
    let Some(Selection::Range(range)) = state.selection() else {
        return Err(test_error("result did not retain a range selection").into());
    };
    assert_eq!(range.anchor(), anchor);
    assert_eq!(range.focus(), focus);
    let resolved = range.resolve(state.context().schema(), state.document())?;
    assert_eq!(resolved.order(), order);
    Ok(())
}

fn only_splice(operations: &[Operation]) -> Result<&TextSplice, Box<dyn Error>> {
    let [Operation::TextSplice(splice)] = operations else {
        return Err(test_error(format!("expected one TextSplice, got {operations:?}")).into());
    };
    Ok(splice)
}

fn only_root_replace(operations: &[Operation]) -> Result<&RootTextReplace, Box<dyn Error>> {
    let [Operation::RootTextReplace(replace)] = operations else {
        return Err(test_error(format!("expected one RootTextReplace, got {operations:?}")).into());
    };
    Ok(replace)
}

#[test]
fn built_in_identity_route_and_stateless_observable_are_exact() -> TestResult {
    let profile = CompiledEditorProfile::try_compile_breditor_base()?;
    let action = ActionId::try_new(CLEAR_ACTION)?;
    let intent = IntentId::try_new(CLEAR_INTENT)?;
    let binding = BindingId::try_new(CLEAR_BINDING)?;
    let state_id = ActionStateId::try_new(CLEAR_STATE)?;

    assert_eq!(clear_inline_formats_action_id(), action);
    assert_eq!(
        profile
            .action_registry()
            .descriptors()
            .map(|descriptor| descriptor.id().as_str())
            .collect::<Vec<_>>(),
        vec![
            CLEAR_ACTION,
            "breditor/delete-backward",
            "breditor/delete-forward",
            "breditor/delete-selection",
            "breditor/insert-paragraph-break",
            "breditor/insert-plain-text",
            "breditor/insert-text",
            "breditor/toggle-strong",
        ],
    );
    assert_eq!(
        profile
            .intent_router()
            .declarations()
            .map(|declaration| declaration.id().as_str())
            .collect::<Vec<_>>(),
        vec![CLEAR_INTENT, "breditor/format-strong"],
    );
    let declaration = profile
        .intent_router()
        .declaration(&intent)
        .ok_or_else(|| test_error("clear intent declaration is missing"))?;
    assert!(declaration.input_contract().is_none());
    assert_eq!(
        declaration.state_spec().contract().activation_contract(),
        ActionActivationContract::Stateless,
    );
    let binding = profile
        .intent_router()
        .binding(&binding)
        .ok_or_else(|| test_error("clear intent binding is missing"))?;
    assert_eq!(binding.intent_id(), &intent);
    assert_eq!(binding.action_id(), &action);
    assert_eq!(binding.priority(), BindingPriority::new(0));
    assert_eq!(binding.disabled_routing(), DisabledRouting::Block);
    assert_eq!(
        profile
            .descriptor()
            .action_states()
            .iter()
            .map(|descriptor| descriptor.id().as_str())
            .collect::<Vec<_>>(),
        vec![
            "breditor/control-bold",
            CLEAR_STATE,
            "breditor/control-redo",
            "breditor/control-undo",
        ],
    );
    let descriptor = profile
        .action_state_catalog()
        .descriptor(&state_id)
        .ok_or_else(|| test_error("clear action-state descriptor is missing"))?;
    assert!(matches!(
        descriptor.source(),
        ActionStateSource::Routed(invocation) if invocation.id() == &intent
    ));
    assert_eq!(descriptor.contract().activation_contract(), ActionActivationContract::Stateless,);
    assert!(matches!(
        profile
            .descriptor()
            .action_state(&state_id)
            .ok_or_else(|| test_error("compiled clear state is missing"))?
            .source(),
        CompiledProfileActionStateSource::Routed(routed) if routed == &intent
    ));
    Ok(())
}

#[test]
fn collapsed_clear_uses_context_affinity_and_explicit_pending_precedence() -> TestResult {
    let profile = typed_profile()?;
    let registry = profile.action_registry();
    let paragraph = paragraph_value(&[
        Run::plain("a"),
        Run::linked("b", "https://context.test").with_label("context"),
    ]);

    let before = state(
        &profile,
        DocumentLimits::default(),
        std::slice::from_ref(&paragraph),
        collapsed(text_point(0, 0, 1, Affinity::Before)?),
        None,
        "clear-caret-before",
    )?;
    assert_disabled(registry, &before, "breditor/inline-format-unchanged")?;

    let after_selection = collapsed(text_point(0, 0, 1, Affinity::After)?);
    let after = state(
        &profile,
        DocumentLimits::default(),
        std::slice::from_ref(&paragraph),
        after_selection.clone(),
        None,
        "clear-caret-after",
    )?;
    let original_document = after.document().clone();
    let prepared = enabled(registry, &after)?;
    assert_eq!(prepared.indicator().activation(), ActionActivation::Stateless);
    assert!(prepared.transaction().operations().is_empty());
    assert_eq!(prepared.transaction().metadata().history(), &HistoryIntent::Record);
    assert_eq!(
        prepared.transaction().pending_formats_update(),
        &PendingFormatsUpdate::Set(Some(FormatSet::default())),
    );
    let commit = prepared.execute(&after)?;
    assert_eq!(commit.after().document(), &original_document);
    assert_eq!(commit.after().selection(), Some(&after_selection));
    assert_eq!(commit.after().pending_formats(), Some(&FormatSet::default()));

    let explicit_formats =
        formats(Run::linked("", "https://pending.test").with_label("pending").with_strong())?;
    let explicit_selection = collapsed(text_point(0, 0, 0, Affinity::Before)?);
    let explicit = state(
        &profile,
        DocumentLimits::default(),
        &[paragraph_value(&[Run::plain("plain")])],
        explicit_selection.clone(),
        Some(explicit_formats),
        "clear-caret-explicit",
    )?;
    let cleared = enabled(registry, &explicit)?.execute(&explicit)?;
    assert_eq!(cleared.after().selection(), Some(&explicit_selection));
    assert_eq!(cleared.after().pending_formats(), Some(&FormatSet::default()));

    let explicit_empty = state(
        &profile,
        DocumentLimits::default(),
        &[paragraph],
        collapsed(text_point(0, 0, 1, Affinity::After)?),
        Some(FormatSet::default()),
        "clear-caret-explicit-empty",
    )?;
    assert_disabled(registry, &explicit_empty, "breditor/inline-format-unchanged")?;
    Ok(())
}

#[test]
#[allow(clippy::too_many_lines)]
fn same_paragraph_clear_preserves_typed_edges_direction_affinity_and_spatial_offsets() -> TestResult
{
    let profile = typed_profile()?;
    let registry = profile.action_registry();
    let paragraphs = [paragraph_value(&[
        Run::linked("ab", "https://left.test").with_label("left"),
        Run::strong("CD"),
        Run::plain("ef"),
    ])];
    let start = text_point(0, 0, 1, Affinity::Before)?;
    let end = text_point(0, 2, 1, Affinity::After)?;
    let canonical_start = text_point(0, 1, 0, Affinity::Before)?;
    let canonical_end = text_point(0, 1, 4, Affinity::After)?;

    for backward in [false, true] {
        let selection = if backward {
            selected(end.clone(), start.clone())
        } else {
            selected(start.clone(), end.clone())
        };
        let initial = state(
            &profile,
            DocumentLimits::default(),
            &paragraphs,
            selection,
            None,
            if backward { "clear-same-backward" } else { "clear-same-forward" },
        )?;
        let prepared = enabled(registry, &initial)?;
        let splice = only_splice(prepared.transaction().operations())?;
        assert_eq!(splice.replacement().len(), 1);
        assert_eq!(prepared.transaction().metadata().history(), &HistoryIntent::Record);
        assert_eq!(
            prepared.transaction().pending_formats_update(),
            &PendingFormatsUpdate::Set(None),
        );
        assert!(matches!(prepared.transaction().selection_update(), SelectionUpdate::Set(Some(_))));

        let commit = prepared.execute(&initial)?;
        only_splice(commit.forward_operations())?;
        only_splice(commit.inverse_operations())?;
        assert_paragraph_runs(
            commit.after().document(),
            0,
            &[Run::linked("a", "https://left.test").with_label("left"), Run::plain("bCDef")],
        )?;
        let (anchor, focus, order) = if backward {
            (&canonical_end, &canonical_start, RangeOrder::Backward)
        } else {
            (&canonical_start, &canonical_end, RangeOrder::Forward)
        };
        assert_selection(commit.after(), anchor, focus, order)?;
        assert_eq!(commit.after().pending_formats(), None);
    }
    Ok(())
}

#[test]
fn same_paragraph_seam_aliases_clear_the_same_text_and_canonicalize_plain_runs() -> TestResult {
    let profile = typed_profile()?;
    let registry = profile.action_registry();
    let paragraph = paragraph_value(&[
        Run::linked("a", "https://left.test"),
        Run::strong("b"),
        Run::linked("c", "https://right.test"),
    ]);
    let selections = [
        selected(text_point(0, 0, 1, Affinity::After)?, text_point(0, 2, 0, Affinity::Before)?),
        selected(child_point(0, 1, Affinity::After)?, child_point(0, 2, Affinity::Before)?),
    ];
    let mut results = Vec::new();
    for (index, selection) in selections.into_iter().enumerate() {
        let initial = state(
            &profile,
            DocumentLimits::default(),
            std::slice::from_ref(&paragraph),
            selection,
            None,
            if index == 0 { "clear-seam-text" } else { "clear-seam-child" },
        )?;
        let commit = enabled(registry, &initial)?.execute(&initial)?;
        assert_paragraph_runs(
            commit.after().document(),
            0,
            &[
                Run::linked("a", "https://left.test"),
                Run::plain("b"),
                Run::linked("c", "https://right.test"),
            ],
        )?;
        results.push(commit.after().document().clone());
    }
    assert_eq!(results[0], results[1]);
    Ok(())
}

#[test]
#[allow(clippy::too_many_lines)]
fn cross_paragraph_clear_keeps_empty_middle_and_exact_unselected_properties() -> TestResult {
    let profile = typed_profile()?;
    let registry = profile.action_registry();
    let paragraphs = [
        paragraph_value(&[Run::linked("ab", "https://left.test").with_label("left label")]),
        paragraph_value(&[]),
        paragraph_value(&[
            Run::linked("C", "https://middle.test").with_strong(),
            Run::linked("de", "https://right.test").with_label("right label"),
        ]),
        paragraph_value(&[Run::linked("Z", "https://outside.test").with_label("outside label")]),
    ];
    let start = text_point(0, 0, 1, Affinity::Before)?;
    let end = text_point(2, 1, 1, Affinity::After)?;
    let initial = state(
        &profile,
        DocumentLimits::default(),
        &paragraphs,
        selected(end, start),
        None,
        "clear-cross-backward",
    )?;
    let prepared = enabled(registry, &initial)?;
    only_root_replace(prepared.transaction().operations())?;
    let commit = prepared.execute(&initial)?;
    only_root_replace(commit.forward_operations())?;
    only_root_replace(commit.inverse_operations())?;
    assert_paragraph_runs(
        commit.after().document(),
        0,
        &[Run::linked("a", "https://left.test").with_label("left label"), Run::plain("b")],
    )?;
    assert_paragraph_runs(commit.after().document(), 1, &[])?;
    assert_paragraph_runs(
        commit.after().document(),
        2,
        &[Run::plain("Cd"), Run::linked("e", "https://right.test").with_label("right label")],
    )?;
    assert_paragraph_runs(
        commit.after().document(),
        3,
        &[Run::linked("Z", "https://outside.test").with_label("outside label")],
    )?;
    assert_selection(
        commit.after(),
        &text_point(2, 1, 0, Affinity::After)?,
        &text_point(0, 1, 0, Affinity::Before)?,
        RangeOrder::Backward,
    )?;
    assert_eq!(commit.after().pending_formats(), None);
    Ok(())
}

#[test]
fn no_text_and_already_plain_reasons_precede_the_operation_budget() -> TestResult {
    let profile = typed_profile()?;
    let limits = DocumentLimits::default();
    let paragraphs = [
        paragraph_value(&[Run::plain("a")]),
        paragraph_value(&[]),
        paragraph_value(&[Run::plain("b")]),
    ];
    let structural = state(
        &profile,
        limits.clone(),
        &paragraphs,
        selected(child_point(0, 1, Affinity::After)?, child_point(2, 0, Affinity::Before)?),
        None,
        "clear-structural-only",
    )?;
    let zero_operation_context =
        profile.editor_context(limits).with_max_operations_per_transaction(0);
    let structural = EditorState::try_new(
        &zero_operation_context,
        LineageId::try_new("clear-structural-only-budget")?,
        structural.document().clone(),
        structural.selection().cloned(),
        None,
    )?;
    assert_disabled(profile.action_registry(), &structural, "breditor/no-selected-text")?;

    let plain = state(
        &profile,
        DocumentLimits::default(),
        &paragraphs,
        selected(text_point(0, 0, 0, Affinity::Before)?, text_point(2, 0, 1, Affinity::After)?),
        None,
        "clear-plain-only",
    )?;
    let plain = EditorState::try_new(
        &zero_operation_context,
        LineageId::try_new("clear-plain-only-budget")?,
        plain.document().clone(),
        plain.selection().cloned(),
        None,
    )?;
    assert_disabled(profile.action_registry(), &plain, "breditor/inline-format-unchanged")?;
    Ok(())
}

#[test]
#[allow(clippy::too_many_lines)]
fn operation_and_result_limits_disable_without_mutating_the_source() -> TestResult {
    let profile = typed_profile()?;

    let operation_base = state(
        &profile,
        DocumentLimits::default(),
        &[paragraph_value(&[Run::strong("x")])],
        selected(text_point(0, 0, 0, Affinity::Before)?, text_point(0, 0, 1, Affinity::After)?),
        None,
        "clear-operation-limit-base",
    )?;
    let operation_context =
        profile.editor_context(DocumentLimits::default()).with_max_operations_per_transaction(0);
    let operation_limited = EditorState::try_new(
        &operation_context,
        LineageId::try_new("clear-operation-limit")?,
        operation_base.document().clone(),
        operation_base.selection().cloned(),
        None,
    )?;
    assert_disabled(
        profile.action_registry(),
        &operation_limited,
        "breditor/operation-budget-exceeded",
    )?;

    let cases = [
        (
            "clear-leaf-limit",
            DocumentLimits::default().with_max_text_bytes(2),
            paragraph_value(&[Run::strong("aa"), Run::linked("bb", "x")]),
            selected(text_point(0, 0, 0, Affinity::Before)?, text_point(0, 1, 2, Affinity::After)?),
        ),
        (
            "clear-child-limit",
            DocumentLimits::default().with_max_children_per_element(1),
            paragraph_value(&[Run::strong("abc")]),
            selected(text_point(0, 0, 1, Affinity::Before)?, text_point(0, 0, 2, Affinity::After)?),
        ),
        (
            "clear-node-limit",
            DocumentLimits::default().with_max_nodes(3),
            paragraph_value(&[Run::strong("abc")]),
            selected(text_point(0, 0, 1, Affinity::Before)?, text_point(0, 0, 2, Affinity::After)?),
        ),
        (
            "clear-property-owner-limit",
            DocumentLimits::default()
                .with_max_property_values(2)
                .with_max_total_property_string_bytes("https://split.testlabel".len()),
            paragraph_value(&[Run::linked("abc", "https://split.test").with_label("label")]),
            selected(text_point(0, 0, 1, Affinity::Before)?, text_point(0, 0, 2, Affinity::After)?),
        ),
    ];

    for (lineage, limits, paragraph, selection) in cases {
        let limited = state(&profile, limits, &[paragraph], selection, None, lineage)?;
        assert_disabled(profile.action_registry(), &limited, "breditor/result-limit-exceeded")?;
    }
    Ok(())
}

#[test]
fn routed_action_state_reports_truthful_stateless_availability() -> TestResult {
    let profile = typed_profile()?;
    let state_id = ActionStateId::try_new(CLEAR_STATE)?;
    let formatted = state(
        &profile,
        DocumentLimits::default(),
        &[paragraph_value(&[Run::strong("x")])],
        selected(text_point(0, 0, 0, Affinity::Before)?, text_point(0, 0, 1, Affinity::After)?),
        None,
        "clear-state-enabled",
    )?;
    let enabled_batch = profile.action_state_catalog().derive(&EditorSession::new(formatted))?;
    let enabled_entry =
        enabled_batch.entry(&state_id).ok_or_else(|| test_error("clear state entry is missing"))?;
    let ActionStateOutcome::Resolved(enabled) = enabled_entry.outcome() else {
        return Err(test_error("clear state entry did not resolve").into());
    };
    assert_eq!(enabled.availability(), &ObservedAvailability::Enabled);
    assert_eq!(enabled.indicator().activation(), ActionActivation::Stateless);
    assert_eq!(enabled.indicator().value(), &ActionStateValue::Unsupported);

    let plain = state(
        &profile,
        DocumentLimits::default(),
        &[paragraph_value(&[Run::plain("x")])],
        selected(text_point(0, 0, 0, Affinity::Before)?, text_point(0, 0, 1, Affinity::After)?),
        None,
        "clear-state-disabled",
    )?;
    let disabled_batch = profile.action_state_catalog().derive(&EditorSession::new(plain))?;
    let disabled_entry = disabled_batch
        .entry(&state_id)
        .ok_or_else(|| test_error("disabled clear state entry is missing"))?;
    let ActionStateOutcome::Resolved(disabled) = disabled_entry.outcome() else {
        return Err(test_error("disabled clear state entry did not resolve").into());
    };
    let ObservedAvailability::Blocked(reason) = disabled.availability() else {
        return Err(test_error("plain clear state was not blocked").into());
    };
    assert_eq!(reason.code().as_str(), "breditor/inline-format-unchanged");
    assert_eq!(disabled.indicator().activation(), ActionActivation::Stateless);
    Ok(())
}

#[test]
fn clear_action_can_be_registered_without_a_format_specific_configuration() -> TestResult {
    let registry = ActionRegistry::try_new(vec![breditor_core::action::ActionRegistration::new(
        clear_inline_formats_action_id(),
        ClearInlineFormatsAction,
    )])?;
    assert_eq!(registry.len(), 1);
    assert!(registry.descriptor(&ActionId::try_new(CLEAR_ACTION)?).is_some());
    Ok(())
}
