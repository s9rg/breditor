//! Cross-paragraph contracts for registration-owned property-aware formatting.

mod support;

use std::error::Error;

use breditor_core::{
    action::{
        ActionActivation, ActionId, ActionInput, ActionInvocation, ActionPreparation,
        ActionRegistration, ActionRegistry, ActionStateId, ActionStateOutcome, ActionValue,
        ObservedAvailability, PreparedAction,
        builtins::{SetInlineFormatAction, set_inline_format_input_contract},
        routing::{BindingId, IntentId},
    },
    codec::{DocumentJsonCodecV2, SessionCheckpointJsonCodecV3, SessionCheckpointLimits},
    document::{Document, PropertyValue},
    extension::{
        ExtensionId, ExtensionLimits, ExtensionManifest, ExtensionSet, ExtensionVersion,
        InlineFormatPropertyContractV1, InlineFormatPropertySpecV1, InlineFormatPropertyTypeV1,
        InlineFormatSetSpecV1, InlineFormatSpecV1, PropertyPresenceV1,
    },
    identity::QualifiedName,
    operation::{Operation, RootTextReplace},
    position::{Affinity, Point, TextOffset},
    profile::CompiledEditorProfile,
    schema::{CompiledSchema, DocumentLimits, PersistedTypeRevision, SchemaId, SchemaVersion},
    selection::{RangeOrder, RangeSelection, ResolvedSelection, Selection},
    session::EditorSession,
    state::{EditorContext, EditorState, LineageId},
    transaction::{Commit, HistoryIntent, PendingFormatsUpdate, SelectionUpdate},
};
use serde_json::{Value, json};
use support::{TestResult, path, test_error};

const LINK: &str = "example/link";
const HREF: &str = "example/href";
const LABEL: &str = "example/label";
const HIGHLIGHT: &str = "example/highlight";
const COLOR: &str = "example/color";
const SET_LINK_ACTION: &str = "example/set-link";
const SET_LINK_INTENT: &str = "example/set-link-intent";
const SET_LINK_BINDING: &str = "example/set-link-binding";
const LINK_PRESENCE_STATE: &str = "example/link-presence";

#[derive(Clone, Copy, Debug)]
struct Run<'a> {
    text: &'a str,
    strong: bool,
    color: Option<&'a str>,
    href: Option<&'a str>,
    label: Option<&'a str>,
}

impl<'a> Run<'a> {
    const fn plain(text: &'a str) -> Self {
        Self { text, strong: false, color: None, href: None, label: None }
    }

    const fn linked(text: &'a str, href: &'a str) -> Self {
        Self { text, strong: false, color: None, href: Some(href), label: None }
    }

    const fn with_strong(mut self) -> Self {
        self.strong = true;
        self
    }

    const fn with_color(mut self, color: &'a str) -> Self {
        self.color = Some(color);
        self
    }

    const fn with_label(mut self, label: &'a str) -> Self {
        self.label = Some(label);
        self
    }
}

fn name(value: &str) -> Result<QualifiedName, Box<dyn Error>> {
    QualifiedName::try_new(value).map_err(Into::into)
}

fn schema_id() -> Result<SchemaId, Box<dyn Error>> {
    Ok(SchemaId::new(name("example/cross-set-profile")?, SchemaVersion::try_new(1)?))
}

fn property_contract(
    format_kind: &str,
    required: &str,
    optional: Option<&str>,
) -> Result<InlineFormatPropertyContractV1, Box<dyn Error>> {
    let mut properties = vec![InlineFormatPropertySpecV1::new(
        name(required)?,
        PropertyPresenceV1::Required,
        InlineFormatPropertyTypeV1::try_string(1, 2_048)?,
    )];
    if let Some(optional) = optional {
        properties.push(InlineFormatPropertySpecV1::new(
            name(optional)?,
            PropertyPresenceV1::Optional,
            InlineFormatPropertyTypeV1::try_string(0, 128)?,
        ));
    }
    InlineFormatPropertyContractV1::try_new(name(format_kind)?, properties).map_err(Into::into)
}

fn extension_set() -> Result<ExtensionSet, Box<dyn Error>> {
    let setter = InlineFormatSetSpecV1::new(
        name(LINK)?,
        ActionId::try_new(SET_LINK_ACTION)?,
        IntentId::try_new(SET_LINK_INTENT)?,
        BindingId::try_new(SET_LINK_BINDING)?,
        ActionStateId::try_new(LINK_PRESENCE_STATE)?,
    );
    let manifest = ExtensionManifest::try_new_with_inline_format_declarations_and_sets(
        ExtensionId::new(name("example/cross-set-extension")?, ExtensionVersion::one()),
        Vec::new(),
        Vec::new(),
        vec![
            InlineFormatSpecV1::new(name(HIGHLIGHT)?, PersistedTypeRevision::one()),
            InlineFormatSpecV1::new(name(LINK)?, PersistedTypeRevision::one()),
        ],
        vec![
            property_contract(HIGHLIGHT, COLOR, None)?,
            property_contract(LINK, HREF, Some(LABEL))?,
        ],
        Vec::new(),
        vec![setter],
    )?;
    ExtensionSet::try_new(vec![manifest], ExtensionLimits::default()).map_err(Into::into)
}

fn compiled_profile() -> Result<CompiledEditorProfile, Box<dyn Error>> {
    CompiledEditorProfile::try_compile_base_text_profile(schema_id()?, extension_set()?)
        .map_err(Into::into)
}

fn typed_schema() -> Result<CompiledSchema, Box<dyn Error>> {
    CompiledSchema::try_compile_base_text_profile(schema_id()?, &extension_set()?)
        .map_err(Into::into)
}

fn registry() -> Result<ActionRegistry, Box<dyn Error>> {
    ActionRegistry::try_new(vec![ActionRegistration::with_input(
        ActionId::try_new(SET_LINK_ACTION)?,
        set_inline_format_input_contract(),
        SetInlineFormatAction::new(name(LINK)?),
    )])
    .map_err(Into::into)
}

fn run_value(run: Run<'_>) -> Value {
    let mut formats = Vec::new();
    if run.strong {
        formats.push(json!({ "type": "breditor/strong", "properties": {} }));
    }
    if let Some(color) = run.color {
        formats.push(json!({ "type": HIGHLIGHT, "properties": { (COLOR): color } }));
    }
    if let Some(href) = run.href {
        let mut properties = serde_json::Map::new();
        properties.insert(HREF.to_owned(), json!(href));
        if let Some(label) = run.label {
            properties.insert(LABEL.to_owned(), json!(label));
        }
        formats.push(json!({ "type": LINK, "properties": properties }));
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

fn object(entries: Vec<(&str, ActionValue)>) -> Result<ActionValue, Box<dyn Error>> {
    ActionValue::try_object(
        entries.into_iter().map(|(key, value)| (key.to_owned(), value)).collect(),
    )
    .map_err(Into::into)
}

fn set_input(href: &str) -> Result<ActionInput, Box<dyn Error>> {
    let property = object(vec![
        ("name", ActionValue::try_from_string(HREF)?),
        ("value", ActionValue::try_from_string(href)?),
    ])?;
    Ok(ActionInput::typed(
        set_inline_format_input_contract(),
        object(vec![
            ("operation", ActionValue::try_from_string("set")?),
            ("properties", ActionValue::try_array(vec![property])?),
        ])?,
    ))
}

fn remove_input() -> Result<ActionInput, Box<dyn Error>> {
    Ok(ActionInput::typed(
        set_inline_format_input_contract(),
        object(vec![("operation", ActionValue::try_from_string("remove")?)])?,
    ))
}

fn invocation(input: ActionInput) -> Result<ActionInvocation, Box<dyn Error>> {
    Ok(ActionInvocation::new(ActionId::try_new(SET_LINK_ACTION)?, input))
}

fn prepare(
    registry: &ActionRegistry,
    state: &EditorState,
    input: ActionInput,
) -> Result<ActionPreparation, Box<dyn Error>> {
    registry.prepare(state, &invocation(input)?).map_err(Into::into)
}

fn enabled(
    registry: &ActionRegistry,
    state: &EditorState,
    input: ActionInput,
) -> Result<PreparedAction, Box<dyn Error>> {
    match prepare(registry, state, input)? {
        ActionPreparation::Enabled(prepared) => Ok(prepared),
        ActionPreparation::Disabled(disabled) => Err(test_error(format!(
            "cross-paragraph set-inline-format unexpectedly disabled: {}",
            disabled.reason().code()
        ))
        .into()),
    }
}

fn assert_disabled(
    registry: &ActionRegistry,
    state: &EditorState,
    input: ActionInput,
    expected_code: &str,
    expected_activation: ActionActivation,
) -> TestResult {
    let original = state.clone();
    let ActionPreparation::Disabled(disabled) = prepare(registry, state, input)? else {
        return Err(test_error(format!("expected disabled reason {expected_code}")).into());
    };
    assert_eq!(disabled.reason().code().as_str(), expected_code);
    assert_eq!(disabled.reason().detail(), None);
    assert_eq!(disabled.indicator().activation(), expected_activation);
    assert_eq!(disabled.base_state(), state);
    assert_eq!(state, &original);
    Ok(())
}

fn only_root_replace(operations: &[Operation]) -> Result<&RootTextReplace, Box<dyn Error>> {
    let [Operation::RootTextReplace(operation)] = operations else {
        return Err(test_error(format!(
            "expected exactly one root-text replacement, got {operations:?}"
        ))
        .into());
    };
    Ok(operation)
}

fn property<'a>(
    document: &'a Document,
    paragraph_index: usize,
    run_index: usize,
    format_kind: &str,
    property_kind: &str,
) -> Option<&'a str> {
    document
        .root()
        .as_element()
        .and_then(|root| root.children().get(paragraph_index))
        .and_then(breditor_core::document::NodeRef::as_element)
        .and_then(|paragraph| paragraph.children().get(run_index))
        .and_then(breditor_core::document::NodeRef::as_text)
        .and_then(|text| text.formats().get(&name(format_kind).ok()?))
        .and_then(|format| format.properties().get(&name(property_kind).ok()?))
        .and_then(PropertyValue::as_string)
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
    for (run_index, (node, expected)) in paragraph.children().iter().zip(expected).enumerate() {
        let actual = node.as_text().ok_or_else(|| test_error("paragraph child is not text"))?;
        assert_eq!(actual.text(), expected.text);
        assert_eq!(actual.formats().get(&name("breditor/strong")?).is_some(), expected.strong);
        assert_eq!(
            property(document, paragraph_index, run_index, HIGHLIGHT, COLOR),
            expected.color
        );
        assert_eq!(property(document, paragraph_index, run_index, LINK, HREF), expected.href);
        assert_eq!(property(document, paragraph_index, run_index, LINK, LABEL), expected.label);
        let expected_formats = usize::from(expected.strong)
            + usize::from(expected.color.is_some())
            + usize::from(expected.href.is_some());
        assert_eq!(actual.formats().len(), expected_formats);
    }
    Ok(())
}

fn assert_selection(
    state: &EditorState,
    expected_anchor: &Point,
    expected_focus: &Point,
    expected_order: RangeOrder,
) -> TestResult {
    let Some(Selection::Range(range)) = state.selection() else {
        return Err(test_error("result selection is missing").into());
    };
    assert_eq!(range.anchor(), expected_anchor);
    assert_eq!(range.focus(), expected_focus);
    let ResolvedSelection::Range(resolved) =
        Selection::Range(range.clone()).resolve(state.context().schema(), state.document())?;
    assert_eq!(resolved.order(), expected_order);
    Ok(())
}

fn execute(
    session: &mut EditorSession,
    registry: &ActionRegistry,
    input: ActionInput,
) -> Result<Commit, Box<dyn Error>> {
    let preparation = prepare(registry, session.state(), input)?;
    session.execute_prepared_action(preparation).map_err(Into::into)
}

fn assert_editor_value(actual: &EditorState, expected: &EditorState) {
    assert_eq!(actual.context(), expected.context());
    assert_eq!(actual.document(), expected.document());
    assert_eq!(actual.selection(), expected.selection());
    assert_eq!(actual.pending_formats(), expected.pending_formats());
}

#[test]
#[allow(clippy::too_many_lines)]
fn set_preserves_typed_peers_complete_properties_outside_edges_and_direction() -> TestResult {
    let registry = registry()?;
    let context = EditorContext::new(typed_schema()?, DocumentLimits::default());
    let paragraphs = [
        paragraph_value(&[
            Run::linked("ab", "old-left").with_label("left label").with_color("blue"),
            Run::plain("C").with_strong(),
        ]),
        paragraph_value(&[]),
        paragraph_value(&[
            Run::linked("D", "old-middle").with_strong(),
            Run::linked("ef", "old-right").with_label("right label").with_color("green"),
        ]),
        paragraph_value(&[Run::linked("Z", "outside")
            .with_label("outside label")
            .with_color("gold")]),
    ];
    let start = text_point(0, 0, 1, Affinity::Before)?;
    let end = text_point(2, 1, 1, Affinity::After)?;

    for backward in [false, true] {
        let selection = if backward {
            selected(end.clone(), start.clone())
        } else {
            selected(start.clone(), end.clone())
        };
        let initial = state(
            &context,
            &paragraphs,
            selection,
            if backward { "cross-set-backward" } else { "cross-set-forward" },
        )?;
        let prepared = enabled(&registry, &initial, set_input("new")?)?;
        assert_eq!(prepared.indicator().activation(), ActionActivation::Inactive);
        let operation = only_root_replace(prepared.transaction().operations())?;
        assert_eq!(operation.range().start().paragraph_path(), &path(&[0])?);
        assert_eq!(operation.range().start().offset(), TextOffset::try_new(1)?);
        assert_eq!(operation.range().end().paragraph_path(), &path(&[2])?);
        assert_eq!(operation.range().end().offset(), TextOffset::try_new(2)?);
        assert_eq!(prepared.transaction().metadata().history(), &HistoryIntent::Record);
        assert_eq!(
            prepared.transaction().pending_formats_update(),
            &PendingFormatsUpdate::Set(None)
        );
        assert!(matches!(prepared.transaction().selection_update(), SelectionUpdate::Set(Some(_))));

        let commit = prepared.execute(&initial)?;
        assert!(matches!(commit.forward_operations(), [Operation::RootTextReplace(_)]));
        assert!(matches!(commit.inverse_operations(), [Operation::RootTextReplace(_)]));
        assert_paragraph_runs(
            commit.after().document(),
            0,
            &[
                Run::linked("a", "old-left").with_label("left label").with_color("blue"),
                Run::linked("b", "new").with_color("blue"),
                Run::linked("C", "new").with_strong(),
            ],
        )?;
        assert_paragraph_runs(commit.after().document(), 1, &[])?;
        assert_paragraph_runs(
            commit.after().document(),
            2,
            &[
                Run::linked("D", "new").with_strong(),
                Run::linked("e", "new").with_color("green"),
                Run::linked("f", "old-right").with_label("right label").with_color("green"),
            ],
        )?;
        assert_paragraph_runs(
            commit.after().document(),
            3,
            &[Run::linked("Z", "outside").with_label("outside label").with_color("gold")],
        )?;
        let canonical_start = text_point(0, 1, 0, Affinity::Before)?;
        let canonical_end = text_point(2, 2, 0, Affinity::After)?;
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
fn remove_strips_only_the_target_kind_across_empty_middle_and_both_directions() -> TestResult {
    let registry = registry()?;
    let context = EditorContext::new(typed_schema()?, DocumentLimits::default());
    let paragraphs = [
        paragraph_value(&[Run::linked("ab", "left").with_label("left label").with_color("blue")]),
        paragraph_value(&[]),
        paragraph_value(&[
            Run::linked("c", "middle").with_strong(),
            Run::linked("de", "right").with_label("right label").with_color("green"),
        ]),
    ];
    let start = text_point(0, 0, 1, Affinity::Before)?;
    let end = text_point(2, 1, 1, Affinity::After)?;
    for backward in [false, true] {
        let selection = if backward {
            selected(end.clone(), start.clone())
        } else {
            selected(start.clone(), end.clone())
        };
        let initial = state(
            &context,
            &paragraphs,
            selection,
            if backward { "cross-remove-backward" } else { "cross-remove-forward" },
        )?;
        let prepared = enabled(&registry, &initial, remove_input()?)?;
        assert_eq!(prepared.indicator().activation(), ActionActivation::Active);
        only_root_replace(prepared.transaction().operations())?;
        let commit = prepared.execute(&initial)?;
        assert_paragraph_runs(
            commit.after().document(),
            0,
            &[
                Run::linked("a", "left").with_label("left label").with_color("blue"),
                Run::plain("b").with_color("blue"),
            ],
        )?;
        assert_paragraph_runs(commit.after().document(), 1, &[])?;
        assert_paragraph_runs(
            commit.after().document(),
            2,
            &[
                Run::plain("c").with_strong(),
                Run::plain("d").with_color("green"),
                Run::linked("e", "right").with_label("right label").with_color("green"),
            ],
        )?;
        let canonical_start = text_point(0, 1, 0, Affinity::Before)?;
        let canonical_end = text_point(2, 2, 0, Affinity::After)?;
        let (anchor, focus, order) = if backward {
            (&canonical_end, &canonical_start, RangeOrder::Backward)
        } else {
            (&canonical_start, &canonical_end, RangeOrder::Forward)
        };
        assert_selection(commit.after(), anchor, focus, order)?;
    }
    Ok(())
}

#[test]
fn structural_only_cross_ranges_are_no_selected_text_before_operation_budget() -> TestResult {
    let registry = registry()?;
    let context = EditorContext::new(typed_schema()?, DocumentLimits::default())
        .with_max_operations_per_transaction(0);
    let initial = state(
        &context,
        &[
            paragraph_value(&[Run::plain("a")]),
            paragraph_value(&[]),
            paragraph_value(&[Run::plain("b")]),
        ],
        selected(child_point(0, 1, Affinity::After)?, child_point(2, 0, Affinity::Before)?),
        "cross-set-structural-only",
    )?;
    for input in [set_input("new")?, remove_input()?] {
        assert_disabled(
            &registry,
            &initial,
            input,
            "breditor/no-selected-text",
            ActionActivation::Inactive,
        )?;
    }

    let all_empty = state(
        &context,
        &[paragraph_value(&[]), paragraph_value(&[]), paragraph_value(&[])],
        selected(child_point(2, 0, Affinity::After)?, child_point(0, 0, Affinity::Before)?),
        "cross-set-all-empty",
    )?;
    assert_disabled(
        &registry,
        &all_empty,
        set_input("new")?,
        "breditor/no-selected-text",
        ActionActivation::Inactive,
    )?;
    Ok(())
}

#[test]
#[allow(clippy::too_many_lines)]
fn cross_result_limits_cover_operation_format_property_leaf_child_and_node_budgets() -> TestResult {
    let registry = registry()?;
    let schema = typed_schema()?;
    let full_selection = || -> Result<Selection, Box<dyn Error>> {
        Ok(selected(text_point(0, 0, 0, Affinity::Before)?, text_point(1, 0, 1, Affinity::After)?))
    };

    let operation_context = EditorContext::new(schema.clone(), DocumentLimits::default())
        .with_max_operations_per_transaction(0);
    let operation_state = state(
        &operation_context,
        &[paragraph_value(&[Run::plain("a")]), paragraph_value(&[Run::plain("b")])],
        full_selection()?,
        "cross-set-operation-limit",
    )?;
    assert_disabled(
        &registry,
        &operation_state,
        set_input("n")?,
        "breditor/operation-budget-exceeded",
        ActionActivation::Inactive,
    )?;

    let format_context =
        EditorContext::new(schema.clone(), DocumentLimits::default().with_max_formats_per_text(1));
    let format_state = state(
        &format_context,
        &[
            paragraph_value(&[Run::plain("a").with_color("x")]),
            paragraph_value(&[Run::plain("b").with_color("y")]),
        ],
        full_selection()?,
        "cross-set-format-limit",
    )?;
    assert_disabled(
        &registry,
        &format_state,
        set_input("n")?,
        "breditor/result-limit-exceeded",
        ActionActivation::Inactive,
    )?;

    for (lineage, limits) in [
        ("cross-set-property-value-limit", DocumentLimits::default().with_max_property_values(1)),
        (
            "cross-set-property-string-limit",
            DocumentLimits::default().with_max_total_property_string_bytes(1),
        ),
    ] {
        let property_context = EditorContext::new(schema.clone(), limits);
        let property_state = state(
            &property_context,
            &[paragraph_value(&[Run::plain("a")]), paragraph_value(&[Run::plain("b")])],
            full_selection()?,
            lineage,
        )?;
        assert_disabled(
            &registry,
            &property_state,
            set_input("n")?,
            "breditor/result-limit-exceeded",
            ActionActivation::Inactive,
        )?;
    }

    let exact_property_context = EditorContext::new(
        schema.clone(),
        DocumentLimits::default()
            .with_max_property_values(2)
            .with_max_total_property_string_bytes(2),
    );
    let exact_property_state = state(
        &exact_property_context,
        &[paragraph_value(&[Run::plain("a")]), paragraph_value(&[Run::plain("b")])],
        full_selection()?,
        "cross-set-property-exact-limit",
    )?;
    let exact_property_commit = enabled(&registry, &exact_property_state, set_input("n")?)?
        .execute(&exact_property_state)?;
    assert_eq!(exact_property_commit.after().document().summary().property_value_count(), 2);
    assert_eq!(exact_property_commit.after().document().summary().total_property_string_bytes(), 2);

    let leaf_context =
        EditorContext::new(schema.clone(), DocumentLimits::default().with_max_text_bytes(2));
    let leaf_state = state(
        &leaf_context,
        &[
            paragraph_value(&[Run::linked("aa", "1"), Run::linked("bb", "2")]),
            paragraph_value(&[Run::plain("x")]),
        ],
        selected(text_point(0, 0, 0, Affinity::Before)?, text_point(1, 0, 1, Affinity::After)?),
        "cross-set-leaf-limit",
    )?;
    assert_disabled(
        &registry,
        &leaf_state,
        set_input("n")?,
        "breditor/result-limit-exceeded",
        ActionActivation::Inactive,
    )?;

    for (lineage, limits) in [
        ("cross-set-child-limit", DocumentLimits::default().with_max_children_per_element(2)),
        ("cross-set-node-limit", DocumentLimits::default().with_max_nodes(6)),
    ] {
        let split_context = EditorContext::new(schema.clone(), limits);
        let split_state = state(
            &split_context,
            &[
                paragraph_value(&[Run::plain("a").with_color("x"), Run::plain("bc")]),
                paragraph_value(&[Run::plain("x")]),
            ],
            selected(text_point(0, 1, 1, Affinity::Before)?, text_point(1, 0, 1, Affinity::After)?),
            lineage,
        )?;
        assert_disabled(
            &registry,
            &split_state,
            set_input("n")?,
            "breditor/result-limit-exceeded",
            ActionActivation::Inactive,
        )?;
    }
    Ok(())
}

#[test]
fn exact_cross_set_and_absent_cross_remove_are_disabled_without_operations() -> TestResult {
    let registry = registry()?;
    let context = EditorContext::new(typed_schema()?, DocumentLimits::default())
        .with_max_operations_per_transaction(0);
    let selection =
        selected(text_point(0, 0, 0, Affinity::Before)?, text_point(2, 0, 1, Affinity::After)?);
    let exact = state(
        &context,
        &[
            paragraph_value(&[Run::linked("a", "same")]),
            paragraph_value(&[]),
            paragraph_value(&[Run::linked("b", "same")]),
        ],
        selection.clone(),
        "cross-set-exact-noop",
    )?;
    assert_disabled(
        &registry,
        &exact,
        set_input("same")?,
        "breditor/inline-format-unchanged",
        ActionActivation::Active,
    )?;

    let absent = state(
        &context,
        &[
            paragraph_value(&[Run::plain("a").with_color("x")]),
            paragraph_value(&[]),
            paragraph_value(&[Run::plain("b").with_strong()]),
        ],
        selection,
        "cross-remove-exact-noop",
    )?;
    assert_disabled(
        &registry,
        &absent,
        remove_input()?,
        "breditor/inline-format-unchanged",
        ActionActivation::Inactive,
    )?;
    Ok(())
}

#[test]
fn cross_set_undo_redo_and_new_set_restore_exact_values_and_clear_redo() -> TestResult {
    let registry = registry()?;
    let context = EditorContext::new(typed_schema()?, DocumentLimits::default());
    let initial_selection =
        selected(text_point(1, 0, 1, Affinity::After)?, text_point(0, 0, 0, Affinity::Before)?);
    let initial = state(
        &context,
        &[paragraph_value(&[Run::plain("a")]), paragraph_value(&[Run::plain("b")])],
        initial_selection.clone(),
        "cross-set-history-branch",
    )?;
    let initial_value = initial.clone();
    let mut session = EditorSession::new(initial);

    let first = execute(&mut session, &registry, set_input("first")?)?;
    assert!(matches!(first.forward_operations(), [Operation::RootTextReplace(_)]));
    assert!(matches!(first.inverse_operations(), [Operation::RootTextReplace(_)]));
    let first_value = session.state().clone();
    assert_eq!((session.undo_depth(), session.redo_depth()), (1, 0));

    let undo = session.undo()?.ok_or_else(|| test_error("cross set undo unavailable"))?;
    assert!(matches!(undo.forward_operations(), [Operation::RootTextReplace(_)]));
    assert_editor_value(session.state(), &initial_value);
    assert_eq!(session.state().selection(), Some(&initial_selection));
    assert_eq!((session.undo_depth(), session.redo_depth()), (0, 1));

    session.redo()?.ok_or_else(|| test_error("cross set redo unavailable"))?;
    assert_editor_value(session.state(), &first_value);
    assert_eq!((session.undo_depth(), session.redo_depth()), (1, 0));

    session.undo()?.ok_or_else(|| test_error("cross set branch undo unavailable"))?;
    let branched = execute(&mut session, &registry, set_input("second")?)?;
    assert_eq!(property(branched.after().document(), 0, 0, LINK, HREF), Some("second"));
    assert_eq!(property(branched.after().document(), 1, 0, LINK, HREF), Some("second"));
    assert_eq!((session.undo_depth(), session.redo_depth()), (1, 0));
    assert!(session.redo()?.is_none());
    Ok(())
}

#[test]
fn v3_checkpoint_replay_preserves_typed_root_replace_on_undo_and_redo_branches() -> TestResult {
    let registry = registry()?;
    let context = EditorContext::new(typed_schema()?, DocumentLimits::default());
    let initial = state(
        &context,
        &[
            paragraph_value(&[Run::linked("ab", "old").with_color("blue")]),
            paragraph_value(&[]),
            paragraph_value(&[Run::plain("cd").with_strong()]),
        ],
        selected(text_point(0, 0, 1, Affinity::Before)?, text_point(2, 0, 1, Affinity::After)?),
        "cross-set-v3-checkpoint",
    )?;
    let initial_value = initial.clone();
    let mut session = EditorSession::new(initial);
    let commit = execute(&mut session, &registry, set_input("checkpoint")?)?;
    assert!(matches!(commit.forward_operations(), [Operation::RootTextReplace(_)]));
    let result = session.state().clone();
    let codec = SessionCheckpointJsonCodecV3::new(context.clone())
        .with_limits(SessionCheckpointLimits::default());

    let tip_json = codec.encode(&session)?;
    assert!(tip_json.contains("rootTextReplace"));
    let mut tip = codec.decode(&tip_json)?;
    assert_editor_value(tip.state(), &result);
    assert_eq!((tip.undo_depth(), tip.redo_depth()), (1, 0));
    tip.undo()?.ok_or_else(|| test_error("restored V3 undo unavailable"))?;
    assert_editor_value(tip.state(), &initial_value);
    assert_eq!((tip.undo_depth(), tip.redo_depth()), (0, 1));

    let redo_json = codec.encode(&tip)?;
    assert!(redo_json.contains("rootTextReplace"));
    let mut redo_branch = codec.decode(&redo_json)?;
    assert_editor_value(redo_branch.state(), &initial_value);
    assert_eq!((redo_branch.undo_depth(), redo_branch.redo_depth()), (0, 1));
    redo_branch.redo()?.ok_or_else(|| test_error("restored V3 redo unavailable"))?;
    assert_editor_value(redo_branch.state(), &result);
    assert_eq!((redo_branch.undo_depth(), redo_branch.redo_depth()), (1, 0));
    Ok(())
}

fn observed_presence(
    profile: &CompiledEditorProfile,
    session: &EditorSession,
) -> Result<(ObservedAvailability, ActionActivation), Box<dyn Error>> {
    let batch = profile.action_state_catalog().derive(session)?;
    let entry = batch
        .entry(&ActionStateId::try_new(LINK_PRESENCE_STATE)?)
        .ok_or_else(|| test_error("generated link presence state is missing"))?;
    let ActionStateOutcome::Resolved(resolved) = entry.outcome() else {
        return Err(test_error("generated link presence state did not resolve").into());
    };
    Ok((resolved.availability().clone(), resolved.indicator().activation()))
}

#[test]
fn generated_profile_presence_state_spans_paragraphs_and_blocks_structural_only_ranges()
-> TestResult {
    let profile = compiled_profile()?;
    let context = profile.editor_context(DocumentLimits::default());
    let selection =
        selected(text_point(0, 0, 0, Affinity::Before)?, text_point(2, 0, 1, Affinity::After)?);
    let cases = [
        (
            "generated-cross-presence-active",
            [
                paragraph_value(&[Run::linked("a", "one")]),
                paragraph_value(&[]),
                paragraph_value(&[Run::linked("b", "two")]),
            ],
            ActionActivation::Active,
            true,
        ),
        (
            "generated-cross-presence-mixed",
            [
                paragraph_value(&[Run::linked("a", "one")]),
                paragraph_value(&[]),
                paragraph_value(&[Run::plain("b")]),
            ],
            ActionActivation::Mixed,
            true,
        ),
        (
            "generated-cross-presence-inactive",
            [
                paragraph_value(&[Run::plain("a")]),
                paragraph_value(&[]),
                paragraph_value(&[Run::plain("b")]),
            ],
            ActionActivation::Inactive,
            false,
        ),
    ];
    for (lineage, paragraphs, expected_activation, enabled) in cases {
        let session = EditorSession::new(state(&context, &paragraphs, selection.clone(), lineage)?);
        let (availability, activation) = observed_presence(&profile, &session)?;
        assert_eq!(activation, expected_activation);
        assert_eq!(matches!(availability, ObservedAvailability::Enabled), enabled);
    }

    let structural = EditorSession::new(state(
        &context,
        &[
            paragraph_value(&[Run::plain("a")]),
            paragraph_value(&[]),
            paragraph_value(&[Run::plain("b")]),
        ],
        selected(child_point(0, 1, Affinity::After)?, child_point(2, 0, Affinity::Before)?),
        "generated-cross-presence-structural",
    )?);
    let (availability, activation) = observed_presence(&profile, &structural)?;
    assert_eq!(activation, ActionActivation::Inactive);
    assert_eq!(
        availability.reason().map(|reason| reason.code().as_str()),
        Some("breditor/no-selected-text")
    );
    Ok(())
}
