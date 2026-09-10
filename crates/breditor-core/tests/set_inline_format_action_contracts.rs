//! Black-box contracts for registration-owned property-aware inline formatting.

mod support;

use std::error::Error;

use breditor_core::{
    action::{
        ActionActivation, ActionId, ActionInput, ActionInputContract, ActionInputError,
        ActionInputVersion, ActionInvocation, ActionPreparation, ActionPrepareError,
        ActionRegistration, ActionRegistry, ActionStateIndicator, ActionStateValue, ActionValue,
        DecodeActionInput, PreparedAction,
        builtins::{
            SET_INLINE_FORMAT_INPUT_PROPERTY_ORDER_CODE, SET_INLINE_FORMAT_INPUT_SHAPE_CODE,
            SetInlineFormatAction, SetInlineFormatInput, inline_format_properties_state_contract,
            set_inline_format_input_contract,
        },
    },
    codec::DocumentJsonCodecV2,
    document::{Children, Document, PropertyMap, PropertyValue},
    extension::{
        ExtensionId, ExtensionLimits, ExtensionManifest, ExtensionSet, ExtensionVersion,
        InlineFormatPropertyContractV1, InlineFormatPropertySpecV1, InlineFormatPropertyTypeV1,
        InlineFormatSpecV1, PropertyPresenceV1,
    },
    identity::QualifiedName,
    operation::{Operation, TextSplice},
    position::{Affinity, Point},
    schema::{CompiledSchema, DocumentLimits, PersistedTypeRevision, SchemaId, SchemaVersion},
    selection::{RangeOrder, RangeSelection, Selection},
    state::{EditorContext, EditorState, LineageId},
    transaction::{Commit, TransactionOutcome},
};
use serde_json::{Value, json};
use support::{TestResult, path, test_error};

const LINK: &str = "example/link";
const HREF: &str = "example/href";
const LABEL: &str = "example/label";

fn name(value: &str) -> Result<QualifiedName, Box<dyn Error>> {
    QualifiedName::try_new(value).map_err(Into::into)
}

fn action_id(value: &str) -> Result<ActionId, Box<dyn Error>> {
    ActionId::try_new(value).map_err(Into::into)
}

fn typed_schema() -> Result<CompiledSchema, Box<dyn Error>> {
    let contract = InlineFormatPropertyContractV1::try_new(
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
        ExtensionId::new(name("example/link-extension")?, ExtensionVersion::try_new(1)?),
        Vec::new(),
        Vec::new(),
        vec![InlineFormatSpecV1::new(name(LINK)?, PersistedTypeRevision::one())],
        vec![contract],
    )?;
    let extensions = ExtensionSet::try_new(vec![manifest], ExtensionLimits::default())?;
    CompiledSchema::try_compile_base_text_profile(
        SchemaId::new(name("example/link-profile")?, SchemaVersion::try_new(1)?),
        &extensions,
    )
    .map_err(Into::into)
}

fn registry_with(
    id: ActionId,
    format_kind: QualifiedName,
) -> Result<ActionRegistry, Box<dyn Error>> {
    ActionRegistry::try_new(vec![ActionRegistration::with_input(
        id,
        set_inline_format_input_contract(),
        SetInlineFormatAction::new(format_kind),
    )])
    .map_err(Into::into)
}

fn format_value(kind: &str, properties: &Value) -> Value {
    json!({ "type": kind, "properties": properties })
}

fn run_value(text: &str, formats: &[Value]) -> Value {
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

fn plain(text: &str) -> Value {
    run_value(text, &[])
}

fn linked(text: &str, href: &str) -> Value {
    run_value(text, &[format_value(LINK, &json!({ (HREF): href }))])
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
    selection: Option<Selection>,
    lineage: &str,
) -> Result<EditorState, Box<dyn Error>> {
    let document = DocumentJsonCodecV2::new(context.schema().clone())
        .with_limits(context.limits().clone())
        .decode(&document_json(context.schema(), paragraphs))?;
    EditorState::try_new(context, LineageId::try_new(lineage)?, document, selection, None)
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

fn selected(anchor: Point, focus: Point) -> Selection {
    RangeSelection::new(anchor, focus).into()
}

fn collapsed(point: Point) -> Selection {
    selected(point.clone(), point)
}

fn object(entries: Vec<(&str, ActionValue)>) -> Result<ActionValue, Box<dyn Error>> {
    ActionValue::try_object(
        entries.into_iter().map(|(key, value)| (key.to_owned(), value)).collect(),
    )
    .map_err(Into::into)
}

fn property_entry(name: &str, value: ActionValue) -> Result<ActionValue, Box<dyn Error>> {
    object(vec![("name", ActionValue::try_from_string(name)?), ("value", value)])
}

fn set_input(properties: Vec<(&str, ActionValue)>) -> Result<ActionInput, Box<dyn Error>> {
    let properties = properties
        .into_iter()
        .map(|(name, value)| property_entry(name, value))
        .collect::<Result<Vec<_>, _>>()?;
    let value = object(vec![
        ("operation", ActionValue::try_from_string("set")?),
        ("properties", ActionValue::try_array(properties)?),
    ])?;
    Ok(ActionInput::typed(set_inline_format_input_contract(), value))
}

fn set_href_input(href: &str) -> Result<ActionInput, Box<dyn Error>> {
    set_input(vec![(HREF, ActionValue::try_from_string(href)?)])
}

fn remove_input() -> Result<ActionInput, Box<dyn Error>> {
    let value = object(vec![("operation", ActionValue::try_from_string("remove")?)])?;
    Ok(ActionInput::typed(set_inline_format_input_contract(), value))
}

fn assert_uniform_properties(
    indicator: &ActionStateIndicator,
    expected: &[(&str, &str)],
) -> TestResult {
    let ActionStateValue::Uniform { contract, value } = indicator.value() else {
        return Err(test_error(format!(
            "expected uniform state value, got {:?}",
            indicator.value()
        ))
        .into());
    };
    assert_eq!(contract, &inline_format_properties_state_contract());
    let input_contract = set_inline_format_input_contract();
    assert_eq!(contract.name(), input_contract.name());
    assert_eq!(contract.version().get(), input_contract.version().get());
    let decoded = SetInlineFormatInput::decode(
        Some(&input_contract),
        &ActionInput::typed(input_contract.clone(), value.clone()),
    )?;
    let properties = decoded
        .properties()
        .ok_or_else(|| test_error("uniform state did not round-trip as a Set input"))?;
    assert_eq!(properties.len(), expected.len());
    for (property_name, expected_value) in expected {
        assert_eq!(
            properties.get(&name(property_name)?).and_then(PropertyValue::as_string),
            Some(*expected_value)
        );
    }
    Ok(())
}

fn assert_unset(indicator: &ActionStateIndicator) {
    assert!(matches!(
        indicator.value(),
        ActionStateValue::Unset { contract }
            if contract == &inline_format_properties_state_contract()
    ));
}

fn assert_mixed(indicator: &ActionStateIndicator) {
    assert!(matches!(
        indicator.value(),
        ActionStateValue::Mixed { contract }
            if contract == &inline_format_properties_state_contract()
    ));
}

fn prepare(
    registry: &ActionRegistry,
    id: &ActionId,
    state: &EditorState,
    input: ActionInput,
) -> Result<ActionPreparation, ActionPrepareError> {
    registry.prepare(state, &ActionInvocation::new(id.clone(), input))
}

fn enabled(
    registry: &ActionRegistry,
    id: &ActionId,
    state: &EditorState,
    input: ActionInput,
) -> Result<PreparedAction, Box<dyn Error>> {
    match prepare(registry, id, state, input)? {
        ActionPreparation::Enabled(prepared) => Ok(prepared),
        ActionPreparation::Disabled(prepared) => Err(test_error(format!(
            "set-inline-format unexpectedly disabled: {}",
            prepared.reason().code()
        ))
        .into()),
    }
}

fn assert_disabled(
    registry: &ActionRegistry,
    id: &ActionId,
    state: &EditorState,
    input: ActionInput,
    expected: &str,
) -> TestResult {
    let original = state.clone();
    let ActionPreparation::Disabled(prepared) = prepare(registry, id, state, input)? else {
        return Err(test_error(format!("expected disabled reason {expected}")).into());
    };
    assert_eq!(prepared.reason().code().as_str(), expected);
    assert_eq!(prepared.reason().detail(), None);
    assert_eq!(prepared.base_state(), state);
    assert_eq!(state, &original);
    Ok(())
}

fn only_splice(operations: &[Operation]) -> Result<&TextSplice, Box<dyn Error>> {
    let [Operation::TextSplice(splice)] = operations else {
        return Err(test_error(format!("expected one TextSplice, got {operations:?}")).into());
    };
    Ok(splice)
}

fn committed(outcome: TransactionOutcome) -> Result<Commit, Box<dyn Error>> {
    match outcome {
        TransactionOutcome::Committed(commit) => Ok(*commit),
        TransactionOutcome::Unchanged => Err(test_error("transaction was unchanged").into()),
    }
}

fn paragraph(document: &Document, index: usize) -> Result<&Children, Box<dyn Error>> {
    document
        .root()
        .as_element()
        .and_then(|root| root.children().get(index))
        .and_then(breditor_core::document::NodeRef::as_element)
        .map(breditor_core::document::ElementNode::children)
        .ok_or_else(|| test_error(format!("paragraph {index} is missing")))
        .map_err(Into::into)
}

fn href(
    document: &Document,
    paragraph_index: usize,
    run_index: usize,
) -> Result<Option<&str>, Box<dyn Error>> {
    let value = paragraph(document, paragraph_index)?
        .get(run_index)
        .and_then(breditor_core::document::NodeRef::as_text)
        .and_then(|text| text.formats().get(&QualifiedName::try_new(LINK).ok()?))
        .and_then(|format| format.properties().get(&QualifiedName::try_new(HREF).ok()?))
        .and_then(PropertyValue::as_string);
    Ok(value)
}

#[test]
fn registration_owns_action_identity_and_publishes_the_exact_input_contract() -> TestResult {
    let id = action_id("example/set-link")?;
    let registry = registry_with(id.clone(), name(LINK)?)?;
    let descriptor = registry.descriptor(&id).ok_or_else(|| test_error("missing descriptor"))?;

    assert_eq!(descriptor.id(), &id);
    assert_eq!(descriptor.input_contract(), Some(&set_inline_format_input_contract()));
    assert!(registry.descriptor(&action_id("breditor/set-inline-format")?).is_none());
    Ok(())
}

#[test]
fn typed_input_is_exact_versioned_canonical_and_payload_redacted() -> TestResult {
    let schema = typed_schema()?;
    let context = EditorContext::new(schema, DocumentLimits::default());
    let id = action_id("example/set-link")?;
    let registry = registry_with(id.clone(), name(LINK)?)?;
    let initial = state(
        &context,
        &[paragraph_value(&[plain("x")])],
        Some(selected(
            text_point(0, 0, 0, Affinity::Before)?,
            text_point(0, 0, 1, Affinity::After)?,
        )),
        "set-link-input",
    )?;

    assert!(matches!(
        prepare(&registry, &id, &initial, ActionInput::None),
        Err(ActionPrepareError::InvalidInput {
            source: ActionInputError::ExpectedTyped { .. },
            ..
        })
    ));

    let wrong_contract = ActionInputContract::new(
        name("breditor/set-inline-format-input")?,
        ActionInputVersion::try_new(2)?,
    );
    assert!(matches!(
        prepare(&registry, &id, &initial, ActionInput::typed(wrong_contract, ActionValue::null()),),
        Err(ActionPrepareError::InvalidInput {
            source: ActionInputError::ContractMismatch { .. },
            ..
        })
    ));

    let extra_remove = object(vec![
        ("operation", ActionValue::try_from_string("remove")?),
        ("properties", ActionValue::try_array(Vec::new())?),
    ])?;
    let Err(error) = prepare(
        &registry,
        &id,
        &initial,
        ActionInput::typed(set_inline_format_input_contract(), extra_remove),
    ) else {
        return Err(test_error("extra remove field must fail").into());
    };
    assert!(matches!(
        error,
        ActionPrepareError::InvalidInput {
            source: ActionInputError::InvalidValue { ref code },
            ..
        } if code.as_str() == SET_INLINE_FORMAT_INPUT_SHAPE_CODE
    ));

    let unsorted = set_input(vec![
        (LABEL, ActionValue::try_from_string("label")?),
        (HREF, ActionValue::try_from_string("https://example.test")?),
    ])?;
    let debug = format!("{unsorted:?}");
    assert!(!debug.contains("https://example.test"));
    let Err(error) = prepare(&registry, &id, &initial, unsorted) else {
        return Err(test_error("noncanonical properties must fail").into());
    };
    assert!(matches!(
        error,
        ActionPrepareError::InvalidInput {
            source: ActionInputError::InvalidValue { ref code },
            ..
        } if code.as_str() == SET_INLINE_FORMAT_INPUT_PROPERTY_ORDER_CODE
    ));
    Ok(())
}

#[test]
fn set_applies_one_guarded_splice_and_inverse_restores_exact_state() -> TestResult {
    let schema = typed_schema()?;
    let context = EditorContext::new(schema, DocumentLimits::default());
    let id = action_id("example/set-link")?;
    let registry = registry_with(id.clone(), name(LINK)?)?;
    let selection =
        selected(text_point(0, 0, 5, Affinity::Before)?, text_point(0, 0, 1, Affinity::After)?);
    let initial = state(
        &context,
        &[paragraph_value(&[plain("abcdef")])],
        Some(selection.clone()),
        "set-link-apply",
    )?;

    let prepared = enabled(&registry, &id, &initial, set_href_input("https://example.test")?)?;
    assert_eq!(prepared.indicator().activation(), ActionActivation::Inactive);
    let planned = only_splice(prepared.transaction().operations())?;
    assert_eq!(
        planned.expected_removed().iter().next().map(breditor_core::document::TextRun::text),
        Some("bcde")
    );
    assert_eq!(
        planned.replacement().iter().next().map(breditor_core::document::TextRun::text),
        Some("bcde")
    );

    let commit = prepared.execute(&initial)?;
    let forward = only_splice(commit.forward_operations())?;
    let inverse = only_splice(commit.inverse_operations())?;
    assert_eq!(forward.replacement(), inverse.expected_removed());
    assert_eq!(forward.expected_removed(), inverse.replacement());
    let children = paragraph(commit.after().document(), 0)?;
    assert_eq!(
        children
            .iter()
            .map(|child| child.as_text().map(breditor_core::document::TextNode::text))
            .collect::<Vec<_>>(),
        [Some("a"), Some("bcde"), Some("f")]
    );
    assert_eq!(href(commit.after().document(), 0, 1)?, Some("https://example.test"));
    let Some(Selection::Range(result_selection)) = commit.after().selection() else {
        return Err(test_error("result selection is missing").into());
    };
    assert_eq!(
        result_selection.resolve(context.schema(), commit.after().document())?.order(),
        RangeOrder::Backward
    );

    let undo =
        committed(commit.undo_transaction(commit.after())?.apply(&context, commit.after())?)?;
    assert_eq!(undo.after().document(), initial.document());
    assert_eq!(undo.after().selection(), Some(&selection));
    assert_eq!(undo.after().pending_formats(), initial.pending_formats());
    Ok(())
}

#[test]
fn set_replaces_the_complete_map_and_remove_ignores_old_properties() -> TestResult {
    let schema = typed_schema()?;
    let context = EditorContext::new(schema, DocumentLimits::default());
    let id = action_id("example/set-link")?;
    let registry = registry_with(id.clone(), name(LINK)?)?;
    let initial = state(
        &context,
        &[paragraph_value(&[linked("x", "https://old.test")])],
        Some(selected(
            text_point(0, 0, 0, Affinity::Before)?,
            text_point(0, 0, 1, Affinity::After)?,
        )),
        "set-link-replace",
    )?;

    let replaced = enabled(&registry, &id, &initial, set_href_input("https://new.test")?)?
        .execute(&initial)?;
    assert_eq!(href(replaced.after().document(), 0, 0)?, Some("https://new.test"));

    let removed =
        enabled(&registry, &id, replaced.after(), remove_input()?)?.execute(replaced.after())?;
    let child = paragraph(removed.after().document(), 0)?
        .get(0)
        .ok_or_else(|| test_error("missing result text"))?
        .as_text()
        .ok_or_else(|| test_error("missing result text"))?;
    assert!(child.formats().is_empty());
    Ok(())
}

#[test]
fn state_value_reports_current_complete_maps_independently_from_dynamic_activation() -> TestResult {
    let schema = typed_schema()?;
    let context = EditorContext::new(schema, DocumentLimits::default());
    let id = action_id("example/set-link")?;
    let registry = registry_with(id.clone(), name(LINK)?)?;

    let uniform = state(
        &context,
        &[paragraph_value(&[run_value(
            "a",
            &[format_value(LINK, &json!({ (HREF): "https://old.test", (LABEL): "old label" }))],
        )])],
        Some(selected(
            text_point(0, 0, 0, Affinity::Before)?,
            text_point(0, 0, 1, Affinity::After)?,
        )),
        "set-link-state-uniform",
    )?;
    let prepared = enabled(&registry, &id, &uniform, set_href_input("https://new.test")?)?;
    assert_eq!(prepared.indicator().activation(), ActionActivation::Inactive);
    assert_uniform_properties(
        prepared.indicator(),
        &[(HREF, "https://old.test"), (LABEL, "old label")],
    )?;

    let differing = state(
        &context,
        &[paragraph_value(&[linked("a", "https://one.test"), linked("b", "https://two.test")])],
        Some(selected(
            text_point(0, 0, 0, Affinity::Before)?,
            text_point(0, 1, 1, Affinity::After)?,
        )),
        "set-link-state-differing",
    )?;
    let prepared = enabled(&registry, &id, &differing, remove_input()?)?;
    assert_eq!(prepared.indicator().activation(), ActionActivation::Active);
    assert_mixed(prepared.indicator());

    let partial = state(
        &context,
        &[paragraph_value(&[linked("a", "https://one.test"), plain("b")])],
        Some(selected(
            text_point(0, 0, 0, Affinity::Before)?,
            text_point(0, 1, 1, Affinity::After)?,
        )),
        "set-link-state-partial",
    )?;
    let prepared = enabled(&registry, &id, &partial, remove_input()?)?;
    assert_eq!(prepared.indicator().activation(), ActionActivation::Mixed);
    assert_mixed(prepared.indicator());

    let absent = state(
        &context,
        &[paragraph_value(&[plain("a")])],
        Some(selected(
            text_point(0, 0, 0, Affinity::Before)?,
            text_point(0, 0, 1, Affinity::After)?,
        )),
        "set-link-state-absent",
    )?;
    let ActionPreparation::Disabled(prepared) = prepare(&registry, &id, &absent, remove_input()?)?
    else {
        return Err(test_error("absent remove unexpectedly enabled").into());
    };
    assert_eq!(prepared.indicator().activation(), ActionActivation::Inactive);
    assert_unset(prepared.indicator());
    Ok(())
}

#[test]
fn shared_schema_admission_rejects_missing_wrong_and_unknown_properties() -> TestResult {
    let schema = typed_schema()?;
    let context = EditorContext::new(schema, DocumentLimits::default());
    let id = action_id("example/set-link")?;
    let registry = registry_with(id.clone(), name(LINK)?)?;
    let initial = state(
        &context,
        &[paragraph_value(&[plain("x")])],
        Some(selected(
            text_point(0, 0, 0, Affinity::Before)?,
            text_point(0, 0, 1, Affinity::After)?,
        )),
        "set-link-invalid-properties",
    )?;

    for input in [
        set_input(Vec::new())?,
        set_input(vec![(HREF, ActionValue::boolean(true))])?,
        set_input(vec![("example/unknown", ActionValue::try_from_string("value")?)])?,
    ] {
        assert_disabled(
            &registry,
            &id,
            &initial,
            input,
            "breditor/invalid-inline-format-properties",
        )?;
    }
    Ok(())
}

#[test]
fn collapsed_set_and_remove_update_exact_typed_pending_formats_without_operations() -> TestResult {
    let schema = typed_schema()?;
    let context = EditorContext::new(schema, DocumentLimits::default());
    let id = action_id("example/set-link")?;
    let registry = registry_with(id.clone(), name(LINK)?)?;
    let selection = collapsed(text_point(0, 0, 1, Affinity::After)?);
    let collapsed_state = state(
        &context,
        &[paragraph_value(&[plain("x")])],
        Some(selection.clone()),
        "set-link-collapsed",
    )?;

    let set = enabled(&registry, &id, &collapsed_state, set_href_input("https://example.test")?)?;
    assert_eq!(set.indicator().activation(), ActionActivation::Inactive);
    assert_unset(set.indicator());
    assert!(set.transaction().operations().is_empty());
    let set = set.execute(&collapsed_state)?;
    assert!(set.forward_operations().is_empty());
    assert_eq!(set.after().document(), collapsed_state.document());
    assert_eq!(set.after().selection(), Some(&selection));
    let link_kind = name(LINK)?;
    let pending = set
        .after()
        .pending_formats()
        .and_then(|formats| formats.get(&link_kind))
        .ok_or_else(|| test_error("typed pending link is missing"))?;
    assert_eq!(
        pending.properties().get(&name(HREF)?).and_then(PropertyValue::as_string),
        Some("https://example.test")
    );

    let remove = enabled(&registry, &id, set.after(), remove_input()?)?;
    assert_eq!(remove.indicator().activation(), ActionActivation::Active);
    assert_uniform_properties(remove.indicator(), &[(HREF, "https://example.test")])?;
    assert!(remove.transaction().operations().is_empty());
    let remove = remove.execute(set.after())?;
    assert_eq!(remove.after().document(), collapsed_state.document());
    assert_eq!(remove.after().selection(), Some(&selection));
    assert!(
        remove.after().pending_formats().is_some_and(breditor_core::document::FormatSet::is_empty)
    );

    let contextual = state(
        &context,
        &[paragraph_value(&[linked("x", "https://context.test")])],
        Some(collapsed(text_point(0, 0, 1, Affinity::After)?)),
        "set-link-collapsed-contextual",
    )?;
    let contextual_set =
        enabled(&registry, &id, &contextual, set_href_input("https://replacement.test")?)?;
    assert_eq!(contextual_set.indicator().activation(), ActionActivation::Inactive);
    assert_uniform_properties(contextual_set.indicator(), &[(HREF, "https://context.test")])?;
    Ok(())
}

#[test]
fn unknown_format_ranges_fail_closed() -> TestResult {
    let schema = typed_schema()?;
    let context = EditorContext::new(schema, DocumentLimits::default());

    let selected_state = state(
        &context,
        &[paragraph_value(&[plain("a")]), paragraph_value(&[plain("b")])],
        Some(selected(
            text_point(0, 0, 0, Affinity::Before)?,
            text_point(1, 0, 1, Affinity::After)?,
        )),
        "set-missing-cross-paragraph",
    )?;

    let unknown_id = action_id("example/set-missing")?;
    let unknown_registry = registry_with(unknown_id.clone(), name("example/missing")?)?;
    assert_disabled(
        &unknown_registry,
        &unknown_id,
        &selected_state,
        remove_input()?,
        "breditor/unsupported-inline-format",
    )?;
    Ok(())
}

#[test]
fn already_exact_set_and_absent_remove_are_disabled_no_ops() -> TestResult {
    let schema = typed_schema()?;
    let context = EditorContext::new(schema, DocumentLimits::default());
    let id = action_id("example/set-link")?;
    let registry = registry_with(id.clone(), name(LINK)?)?;
    let selection = Some(selected(
        text_point(0, 0, 0, Affinity::Before)?,
        text_point(0, 0, 1, Affinity::After)?,
    ));

    let linked_state = state(
        &context,
        &[paragraph_value(&[linked("x", "https://same.test")])],
        selection.clone(),
        "set-link-unchanged-set",
    )?;
    assert_disabled(
        &registry,
        &id,
        &linked_state,
        set_href_input("https://same.test")?,
        "breditor/inline-format-unchanged",
    )?;

    let plain_state =
        state(&context, &[paragraph_value(&[plain("x")])], selection, "set-link-unchanged-remove")?;
    assert_disabled(
        &registry,
        &id,
        &plain_state,
        remove_input()?,
        "breditor/inline-format-unchanged",
    )?;
    Ok(())
}

#[test]
fn range_splitting_accounts_for_duplicated_property_values_before_planning() -> TestResult {
    let schema = typed_schema()?;
    let limits = DocumentLimits::default().with_max_property_values(2);
    let context = EditorContext::new(schema, limits);
    let id = action_id("example/set-link")?;
    let registry = registry_with(id.clone(), name(LINK)?)?;
    let initial = state(
        &context,
        &[paragraph_value(&[linked("abc", "https://old.test")])],
        Some(selected(
            text_point(0, 0, 1, Affinity::Before)?,
            text_point(0, 0, 2, Affinity::After)?,
        )),
        "set-link-property-budget",
    )?;

    // Retaining the old link on both sides and applying the new one in the
    // middle would turn one property value into three.
    assert_disabled(
        &registry,
        &id,
        &initial,
        set_href_input("https://new.test")?,
        "breditor/result-limit-exceeded",
    )?;
    Ok(())
}

#[test]
fn public_direct_input_constructors_preserve_the_full_map_without_exposing_values() -> TestResult {
    let properties = PropertyMap::try_from_sorted(vec![(
        name(HREF)?,
        PropertyValue::from_string("https://secret.test"),
    )])?;
    let set = breditor_core::action::builtins::SetInlineFormatInput::set(properties.clone());
    let remove = breditor_core::action::builtins::SetInlineFormatInput::remove();

    assert_eq!(set.properties(), Some(&properties));
    assert!(!set.is_remove());
    assert!(remove.is_remove());
    assert_eq!(remove.properties(), None);
    assert!(!format!("{set:?}").contains("https://secret.test"));
    Ok(())
}
