//! Black-box contracts for schema-registered property-free format toggles.

mod support;

use std::error::Error;

use breditor_core::{
    action::{
        ActionActivation, ActionId, ActionInvocation, ActionPreparation, ActionRegistration,
        ActionRegistry, PreparedAction,
        builtins::{ToggleInlineFormatAction, base_action_registrations, toggle_strong_action_id},
    },
    codec::DocumentJsonCodecV2,
    document::{Document, Format, FormatSet, PropertyMap},
    extension::{
        ExtensionId, ExtensionLimits, ExtensionManifest, ExtensionSet, ExtensionVersion,
        InlineFormatSpecV1,
    },
    identity::QualifiedName,
    operation::{Operation, RootTextReplace, TextSplice},
    position::{Affinity, Point},
    schema::{CompiledSchema, DocumentLimits, PersistedTypeRevision, SchemaId, SchemaVersion},
    selection::{RangeOrder, RangeSelection, ResolvedSelection, Selection},
    state::{EditorContext, EditorState, LineageId},
};
use serde_json::{Value, json};
use support::{TestResult, path, test_error};

const STRONG: &str = "breditor/strong";
const HIGHLIGHT: &str = "example/highlight";
const UNDERLINE: &str = "example/underline";
const MISSING: &str = "example/missing";

const NO_FORMATS: &[&str] = &[];
const STRONG_ONLY: &[&str] = &[STRONG];
const HIGHLIGHT_ONLY: &[&str] = &[HIGHLIGHT];
const STRONG_HIGHLIGHT_UNDERLINE: &[&str] = &[STRONG, HIGHLIGHT, UNDERLINE];
const STRONG_UNDERLINE: &[&str] = &[STRONG, UNDERLINE];

fn qualified(value: &str) -> Result<QualifiedName, Box<dyn Error>> {
    QualifiedName::try_new(value).map_err(Into::into)
}

fn profile_schema() -> Result<CompiledSchema, Box<dyn Error>> {
    let owner =
        ExtensionId::new(qualified("example/format-extension")?, ExtensionVersion::try_new(1)?);
    let manifest = ExtensionManifest::try_new_with_inline_formats(
        owner,
        Vec::new(),
        Vec::new(),
        vec![
            InlineFormatSpecV1::new(qualified(UNDERLINE)?, PersistedTypeRevision::try_new(1)?),
            InlineFormatSpecV1::new(qualified(HIGHLIGHT)?, PersistedTypeRevision::try_new(1)?),
        ],
    )?;
    let extensions = ExtensionSet::try_new(vec![manifest], ExtensionLimits::default())?;
    let schema_id = SchemaId::new(qualified("example/format-profile")?, SchemaVersion::try_new(1)?);
    CompiledSchema::try_compile_base_text_profile(schema_id, &extensions).map_err(Into::into)
}

fn action_id(value: &str) -> Result<ActionId, Box<dyn Error>> {
    ActionId::try_new(value).map_err(Into::into)
}

fn registry_with(
    id: ActionId,
    format_kind: QualifiedName,
) -> Result<ActionRegistry, Box<dyn Error>> {
    let mut registrations = base_action_registrations();
    registrations.push(ActionRegistration::new(id, ToggleInlineFormatAction::new(format_kind)));
    ActionRegistry::try_new(registrations).map_err(Into::into)
}

fn run_value(text: &str, formats: &[&str]) -> Value {
    json!({
        "kind": "text",
        "text": text,
        "formats": formats
            .iter()
            .map(|kind| json!({ "type": kind, "properties": {} }))
            .collect::<Vec<_>>(),
    })
}

fn paragraph_value(runs: &[(&str, &[&str])]) -> Value {
    json!({
        "kind": "element",
        "type": "breditor/paragraph",
        "entityId": null,
        "properties": {},
        "children": runs
            .iter()
            .map(|(text, formats)| run_value(text, formats))
            .collect::<Vec<_>>(),
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
    pending_formats: Option<FormatSet>,
    lineage: &str,
) -> Result<EditorState, Box<dyn Error>> {
    let document = DocumentJsonCodecV2::new(context.schema().clone())
        .with_limits(context.limits().clone())
        .decode(&document_json(context.schema(), paragraphs))?;
    EditorState::try_new(
        context,
        LineageId::try_new(lineage)?,
        document,
        Some(selection),
        pending_formats,
    )
    .map_err(Into::into)
}

fn format_set(kinds: &[&str]) -> Result<FormatSet, Box<dyn Error>> {
    let mut formats = kinds
        .iter()
        .map(|kind| Ok(Format::new(qualified(kind)?, PropertyMap::default())))
        .collect::<Result<Vec<_>, Box<dyn Error>>>()?;
    formats.sort_by(|left, right| left.kind().cmp(right.kind()));
    FormatSet::try_from_formats(formats).map_err(Into::into)
}

fn text_point(
    paragraph_index: u32,
    text_index: u32,
    utf16_offset: u32,
    affinity: Affinity,
) -> Result<Point, Box<dyn Error>> {
    Ok(Point::Text { text_path: path(&[paragraph_index, text_index])?, utf16_offset, affinity })
}

fn collapsed(point: Point) -> Selection {
    RangeSelection::new(point.clone(), point).into()
}

fn selected(anchor: Point, focus: Point) -> Selection {
    RangeSelection::new(anchor, focus).into()
}

fn invocation(id: &ActionId) -> ActionInvocation {
    ActionInvocation::without_input(id.clone())
}

fn prepare(
    registry: &ActionRegistry,
    id: &ActionId,
    state: &EditorState,
) -> Result<ActionPreparation, Box<dyn Error>> {
    registry.prepare(state, &invocation(id)).map_err(Into::into)
}

fn enabled(
    registry: &ActionRegistry,
    id: &ActionId,
    state: &EditorState,
) -> Result<PreparedAction, Box<dyn Error>> {
    match prepare(registry, id, state)? {
        ActionPreparation::Enabled(prepared) => Ok(prepared),
        ActionPreparation::Disabled(prepared) => Err(test_error(format!(
            "inline-format toggle unexpectedly disabled: {}",
            prepared.reason().code()
        ))
        .into()),
    }
}

fn assert_disabled(
    registry: &ActionRegistry,
    id: &ActionId,
    state: &EditorState,
    expected_code: &str,
    expected_activation: ActionActivation,
) -> TestResult {
    let original = state.clone();
    let ActionPreparation::Disabled(prepared) = prepare(registry, id, state)? else {
        return Err(test_error(format!("expected disabled reason {expected_code}")).into());
    };
    assert_eq!(prepared.reason().code().as_str(), expected_code);
    assert_eq!(prepared.reason().detail(), None);
    assert_eq!(prepared.indicator().activation(), expected_activation);
    assert_eq!(prepared.base_state(), state);
    assert_eq!(state, &original);
    Ok(())
}

fn assert_paragraph_runs(
    document: &Document,
    paragraph_index: usize,
    expected: &[(&str, &[&str])],
) -> TestResult {
    let paragraph = document
        .root()
        .as_element()
        .and_then(|root| root.children().get(paragraph_index))
        .and_then(breditor_core::document::NodeRef::as_element)
        .ok_or_else(|| test_error(format!("paragraph {paragraph_index} is missing")))?;
    assert_eq!(paragraph.children().len(), expected.len());
    for (child, (expected_text, expected_formats)) in paragraph.children().iter().zip(expected) {
        let text = child.as_text().ok_or_else(|| test_error("paragraph child was not text"))?;
        assert_eq!(text.text(), *expected_text);
        assert_eq!(text.formats(), &format_set(expected_formats)?);
        assert_eq!(
            text.formats().iter().map(|format| format.kind().as_str()).collect::<Vec<_>>(),
            *expected_formats
        );
    }
    Ok(())
}

fn assert_exact_range(state: &EditorState, anchor: &Point, focus: &Point) -> TestResult {
    let Some(Selection::Range(range)) = state.selection() else {
        return Err(test_error("state did not contain a range selection").into());
    };
    assert_eq!(range.anchor(), anchor);
    assert_eq!(range.focus(), focus);
    Ok(())
}

fn only_splice(operations: &[Operation]) -> Result<&TextSplice, Box<dyn Error>> {
    let [Operation::TextSplice(operation)] = operations else {
        return Err(
            test_error(format!("expected exactly one text splice, got {operations:?}")).into()
        );
    };
    Ok(operation)
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

#[test]
fn collapsed_toggle_uses_context_affinity_and_explicit_pending_precedence() -> TestResult {
    let schema = profile_schema()?;
    let context = EditorContext::new(schema, DocumentLimits::default());
    let id = action_id("example/toggle-highlight")?;
    let registry = registry_with(id.clone(), qualified(HIGHLIGHT)?)?;
    let paragraphs = [paragraph_value(&[("ab", NO_FORMATS), ("CD", HIGHLIGHT_ONLY)])];

    for (affinity, activation, expected_pending) in [
        (Affinity::Before, ActionActivation::Inactive, HIGHLIGHT_ONLY),
        (Affinity::After, ActionActivation::Active, NO_FORMATS),
    ] {
        let selection = collapsed(text_point(0, 0, 2, affinity)?);
        let initial = state(
            &context,
            &paragraphs,
            selection.clone(),
            None,
            match affinity {
                Affinity::Before => "generic-collapsed-before",
                Affinity::After => "generic-collapsed-after",
            },
        )?;
        let original_document = initial.document().clone();
        let prepared = enabled(&registry, &id, &initial)?;
        assert_eq!(prepared.indicator().activation(), activation);
        assert!(prepared.transaction().operations().is_empty());
        let commit = prepared.execute(&initial)?;
        assert_eq!(commit.after().document(), &original_document);
        assert_eq!(commit.after().selection(), Some(&selection));
        assert_eq!(commit.after().pending_formats(), Some(&format_set(expected_pending)?));
    }

    let explicit = state(
        &context,
        &[paragraph_value(&[("plain", NO_FORMATS)])],
        collapsed(text_point(0, 0, 2, Affinity::After)?),
        Some(format_set(HIGHLIGHT_ONLY)?),
        "generic-collapsed-explicit-pending",
    )?;
    let prepared = enabled(&registry, &id, &explicit)?;
    assert_eq!(prepared.indicator().activation(), ActionActivation::Active);
    assert!(prepared.transaction().operations().is_empty());
    let commit = prepared.execute(&explicit)?;
    assert_eq!(commit.after().pending_formats(), Some(&FormatSet::default()));
    Ok(())
}

#[test]
fn same_paragraph_inactive_active_and_mixed_use_one_splice_and_preserve_direction() -> TestResult {
    struct Case {
        lineage: &'static str,
        source: Value,
        anchor: Point,
        focus: Point,
        activation: ActionActivation,
        expected: Vec<(&'static str, &'static [&'static str])>,
        result_anchor: Point,
        result_focus: Point,
        order: RangeOrder,
    }

    let schema = profile_schema()?;
    let context = EditorContext::new(schema, DocumentLimits::default());
    let id = action_id("example/toggle-highlight")?;
    let registry = registry_with(id.clone(), qualified(HIGHLIGHT)?)?;
    let cases = vec![
        Case {
            lineage: "generic-inline-inactive",
            source: paragraph_value(&[("abc", NO_FORMATS)]),
            anchor: text_point(0, 0, 1, Affinity::Before)?,
            focus: text_point(0, 0, 2, Affinity::After)?,
            activation: ActionActivation::Inactive,
            expected: vec![("a", NO_FORMATS), ("b", HIGHLIGHT_ONLY), ("c", NO_FORMATS)],
            result_anchor: text_point(0, 1, 0, Affinity::Before)?,
            result_focus: text_point(0, 2, 0, Affinity::After)?,
            order: RangeOrder::Forward,
        },
        Case {
            lineage: "generic-inline-active",
            source: paragraph_value(&[("abc", HIGHLIGHT_ONLY)]),
            anchor: text_point(0, 0, 1, Affinity::After)?,
            focus: text_point(0, 0, 2, Affinity::Before)?,
            activation: ActionActivation::Active,
            expected: vec![("a", HIGHLIGHT_ONLY), ("b", NO_FORMATS), ("c", HIGHLIGHT_ONLY)],
            result_anchor: text_point(0, 1, 0, Affinity::After)?,
            result_focus: text_point(0, 2, 0, Affinity::Before)?,
            order: RangeOrder::Forward,
        },
        Case {
            lineage: "generic-inline-mixed-backward",
            source: paragraph_value(&[("a", NO_FORMATS), ("B", HIGHLIGHT_ONLY), ("c", NO_FORMATS)]),
            anchor: text_point(0, 2, 1, Affinity::Before)?,
            focus: text_point(0, 0, 0, Affinity::After)?,
            activation: ActionActivation::Mixed,
            expected: vec![("aBc", HIGHLIGHT_ONLY)],
            result_anchor: text_point(0, 0, 3, Affinity::Before)?,
            result_focus: text_point(0, 0, 0, Affinity::After)?,
            order: RangeOrder::Backward,
        },
    ];

    for case in cases {
        let initial =
            state(&context, &[case.source], selected(case.anchor, case.focus), None, case.lineage)?;
        let prepared = enabled(&registry, &id, &initial)?;
        assert_eq!(prepared.indicator().activation(), case.activation);
        only_splice(prepared.transaction().operations())?;
        let commit = prepared.execute(&initial)?;
        only_splice(commit.forward_operations())?;
        assert_paragraph_runs(commit.after().document(), 0, &case.expected)?;
        assert_exact_range(commit.after(), &case.result_anchor, &case.result_focus)?;
        let ResolvedSelection::Range(resolved) = commit
            .after()
            .selection()
            .ok_or_else(|| test_error("result selection was absent"))?
            .resolve(context.schema(), commit.after().document())?;
        assert_eq!(resolved.order(), case.order);
    }
    Ok(())
}

#[test]
fn adding_a_format_preserves_strong_and_other_formats_in_canonical_order() -> TestResult {
    let schema = profile_schema()?;
    let context = EditorContext::new(schema, DocumentLimits::default());
    let id = action_id("example/toggle-highlight")?;
    let registry = registry_with(id.clone(), qualified(HIGHLIGHT)?)?;
    let initial = state(
        &context,
        &[paragraph_value(&[("x", STRONG_UNDERLINE)])],
        selected(text_point(0, 0, 0, Affinity::Before)?, text_point(0, 0, 1, Affinity::After)?),
        None,
        "generic-inline-preserves-formats",
    )?;

    let prepared = enabled(&registry, &id, &initial)?;
    assert_eq!(prepared.indicator().activation(), ActionActivation::Inactive);
    let splice = only_splice(prepared.transaction().operations())?;
    let mut replacements = splice.replacement().iter();
    let replacement = replacements.next().ok_or_else(|| test_error("replacement was empty"))?;
    assert!(replacements.next().is_none(), "replacement was not one canonical run");
    assert_eq!(
        replacement.formats().iter().map(|format| format.kind().as_str()).collect::<Vec<_>>(),
        STRONG_HIGHLIGHT_UNDERLINE
    );
    let commit = prepared.execute(&initial)?;
    assert_paragraph_runs(commit.after().document(), 0, &[("x", STRONG_HIGHLIGHT_UNDERLINE)])?;
    Ok(())
}

#[test]
fn cross_paragraph_toggle_is_one_root_replace_and_structural_only_is_disabled() -> TestResult {
    let schema = profile_schema()?;
    let context = EditorContext::new(schema, DocumentLimits::default());
    let id = action_id("example/toggle-highlight")?;
    let registry = registry_with(id.clone(), qualified(HIGHLIGHT)?)?;
    let initial = state(
        &context,
        &[
            paragraph_value(&[("ab", NO_FORMATS)]),
            paragraph_value(&[]),
            paragraph_value(&[("cd", NO_FORMATS)]),
        ],
        selected(text_point(0, 0, 1, Affinity::Before)?, text_point(2, 0, 1, Affinity::After)?),
        None,
        "generic-inline-cross-paragraph",
    )?;
    let prepared = enabled(&registry, &id, &initial)?;
    assert_eq!(prepared.indicator().activation(), ActionActivation::Inactive);
    only_root_replace(prepared.transaction().operations())?;
    let commit = prepared.execute(&initial)?;
    only_root_replace(commit.forward_operations())?;
    assert_paragraph_runs(
        commit.after().document(),
        0,
        &[("a", NO_FORMATS), ("b", HIGHLIGHT_ONLY)],
    )?;
    assert_paragraph_runs(commit.after().document(), 1, &[])?;
    assert_paragraph_runs(
        commit.after().document(),
        2,
        &[("c", HIGHLIGHT_ONLY), ("d", NO_FORMATS)],
    )?;

    let structural_only = state(
        &context,
        &[paragraph_value(&[("a", NO_FORMATS)]), paragraph_value(&[("b", NO_FORMATS)])],
        selected(text_point(0, 0, 1, Affinity::Before)?, text_point(1, 0, 0, Affinity::After)?),
        None,
        "generic-inline-structural-only",
    )?;
    assert_disabled(
        &registry,
        &id,
        &structural_only,
        "breditor/no-selected-text",
        ActionActivation::Inactive,
    )?;
    Ok(())
}

#[test]
fn unknown_format_is_fail_closed_without_constructing_an_operation() -> TestResult {
    let schema = profile_schema()?;
    let context = EditorContext::new(schema, DocumentLimits::default());
    let id = action_id("example/toggle-missing")?;
    let registry = registry_with(id.clone(), qualified(MISSING)?)?;
    let initial = state(
        &context,
        &[paragraph_value(&[("text", NO_FORMATS)])],
        selected(text_point(0, 0, 0, Affinity::Before)?, text_point(0, 0, 4, Affinity::After)?),
        None,
        "generic-inline-unknown-kind",
    )?;

    assert_disabled(
        &registry,
        &id,
        &initial,
        "breditor/unsupported-inline-format",
        ActionActivation::Inactive,
    )?;
    Ok(())
}

#[test]
fn format_limit_blocks_addition_but_not_removal() -> TestResult {
    let schema = profile_schema()?;
    let context =
        EditorContext::new(schema, DocumentLimits::default().with_max_formats_per_text(1));
    let id = action_id("example/toggle-highlight")?;
    let registry = registry_with(id.clone(), qualified(HIGHLIGHT)?)?;
    let selection =
        selected(text_point(0, 0, 0, Affinity::Before)?, text_point(0, 0, 1, Affinity::After)?);

    let add = state(
        &context,
        &[paragraph_value(&[("x", STRONG_ONLY)])],
        selection.clone(),
        None,
        "generic-inline-format-limit-add",
    )?;
    assert_disabled(
        &registry,
        &id,
        &add,
        "breditor/result-limit-exceeded",
        ActionActivation::Inactive,
    )?;

    let remove = state(
        &context,
        &[paragraph_value(&[("x", HIGHLIGHT_ONLY)])],
        selection,
        None,
        "generic-inline-format-limit-remove",
    )?;
    let prepared = enabled(&registry, &id, &remove)?;
    assert_eq!(prepared.indicator().activation(), ActionActivation::Active);
    only_splice(prepared.transaction().operations())?;
    let commit = prepared.execute(&remove)?;
    assert_paragraph_runs(commit.after().document(), 0, &[("x", NO_FORMATS)])?;
    Ok(())
}

#[test]
fn generic_strong_handler_matches_the_compatibility_action() -> TestResult {
    let schema = profile_schema()?;
    let context = EditorContext::new(schema, DocumentLimits::default());
    let generic_id = action_id("example/toggle-strong-via-generic")?;
    let registry = registry_with(generic_id.clone(), qualified(STRONG)?)?;
    let initial = state(
        &context,
        &[paragraph_value(&[("a", NO_FORMATS), ("B", STRONG_ONLY), ("c", NO_FORMATS)])],
        selected(text_point(0, 2, 1, Affinity::Before)?, text_point(0, 0, 0, Affinity::After)?),
        None,
        "generic-inline-strong-parity",
    )?;

    let legacy_id = toggle_strong_action_id();
    let legacy = enabled(&registry, &legacy_id, &initial)?;
    let generic = enabled(&registry, &generic_id, &initial)?;
    assert_eq!(legacy.indicator(), generic.indicator());
    assert_eq!(legacy.actual_writes(), generic.actual_writes());
    assert_eq!(legacy.transaction().operations(), generic.transaction().operations());
    assert_eq!(
        legacy.transaction().selection_relocation(),
        generic.transaction().selection_relocation()
    );
    assert_eq!(legacy.transaction().selection_update(), generic.transaction().selection_update());
    assert_eq!(
        legacy.transaction().pending_formats_update(),
        generic.transaction().pending_formats_update()
    );
    assert_eq!(
        legacy.transaction().metadata().history(),
        generic.transaction().metadata().history()
    );
    assert_eq!(legacy.transaction().metadata().action(), Some(legacy_id.qualified_name()));
    assert_eq!(generic.transaction().metadata().action(), Some(generic_id.qualified_name()));
    let legacy_commit = legacy.execute(&initial)?;
    let generic_commit = generic.execute(&initial)?;
    assert_eq!(legacy_commit.after(), generic_commit.after());
    assert_eq!(legacy_commit.forward_operations(), generic_commit.forward_operations());
    assert_eq!(legacy_commit.inverse_operations(), generic_commit.inverse_operations());
    Ok(())
}
