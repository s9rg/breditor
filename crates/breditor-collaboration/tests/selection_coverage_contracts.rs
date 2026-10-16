//! Shared selection coverage, complete-format lowering, peer ownership and exact restart.
#[path = "../../breditor-core/tests/support/coverage_fixture.rs"]
mod fixture;
use breditor_collaboration::{
    anchor::Affinity,
    rich_replica::{
        Command, RichReplica, SharedRichProfile,
        actions::{InsertText, SetFormat},
        selection::{CellTarget, Selection, TextPoint},
    },
};
use breditor_core::{
    document::{Format, PropertyMap},
    extension::{ExtensionLimits, ExtensionSet},
    identity::QualifiedName,
    rich_content::{RichSelectionFormatChange, standard_inline_extension_v1},
    schema::{CompiledSchema, DocumentLimits, SchemaId, SchemaVersion},
};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
fn text(a: &str, start: u32, b: &str, end: u32) -> Selection {
    Selection::TextRange {
        anchor: TextPoint { block: a.into(), offset: start, affinity: Affinity::After },
        focus: TextPoint { block: b.into(), offset: end, affinity: Affinity::After },
    }
}
fn grid() -> Selection {
    let c = CellTarget { table: "t".into(), row: "r1".into(), column: "c1".into() };
    Selection::Grid { anchor: c.clone(), focus: c }
}
fn bold() -> Result<Format> {
    Ok(Format::new(
        QualifiedName::try_new("breditor/strong")?,
        PropertyMap::try_from_sorted(vec![])?,
    ))
}
fn setup() -> Result<(SharedRichProfile, RichReplica, RichReplica)> {
    let schema = CompiledSchema::try_compile_rich_content_profile_v2(
        SchemaId::new(
            QualifiedName::try_new("example/shared-coverage")?,
            SchemaVersion::try_new(1)?,
        ),
        &ExtensionSet::try_new(vec![standard_inline_extension_v1()], ExtensionLimits::default())?,
    )?;
    let p = SharedRichProfile::from_schema_v2(schema, DocumentLimits::default())?;
    let input=json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/shared-coverage","version":1},"schemaFingerprint":p.schema().fingerprint().to_string(),"root":fixture::root()}).to_string();
    let a = p.create(&input, "101".into())?;
    let b = p.join_frame("room".into(), "202".into(), &a.update_frame()?)?;
    Ok((p, a, b))
}
fn saved(a: &RichReplica) -> Result<String> {
    Ok(if a.typing_history_enabled() { a.typing_checkpoint()? } else { a.checkpoint()? })
}
fn restore(p: &SharedRichProfile, a: &RichReplica) -> Result<RichReplica> {
    Ok(if a.typing_history_enabled() {
        p.restore_typing("room", &saved(a)?)?
    } else {
        p.restore("room", &saved(a)?)?
    })
}
fn read(a: &RichReplica) -> Result<Value> {
    Ok(serde_json::from_str(&a.selection_coverage_json_guarded(&a.observe()?, "selection")?)?)
}
fn sync(a: &mut RichReplica, b: &mut RichReplica) -> Result {
    let x = a.update_frame()?;
    let y = b.update_frame()?;
    a.receive_frame(&y)?;
    b.receive_frame(&x)?;
    assert_eq!(a.document_json(), b.document_json());
    Ok(())
}
#[test]
fn reads_keep_merge_closure_direction_domains_and_causal_state_exact() -> Result {
    let (_, mut a, _) = setup()?;
    for s in [text("q2", 2, "z-intro", 1), grid(), Selection::Node { block: "image".into() }] {
        a.set_selection(Some(&s))?;
        let cp = saved(&a)?;
        let frame = a.update_frame()?;
        let version = a.causal_version();
        let r = read(&a)?;
        assert_eq!(r["format"], "breditor/rich-selection-coverage");
        assert_eq!(r["formatVersion"], 1);
        assert_eq!(
            r["schema"]["fingerprint"],
            a.descriptor_json().parse::<Value>()?["schemaFingerprint"]
        );
        if matches!(s, Selection::Grid { .. }) {
            assert_eq!(r["text"].as_array().ok_or("text")?.len(), 4);
            assert_eq!(r["selectedUtf16"], "16");
        }
        if matches!(s, Selection::TextRange { .. }) {
            assert_eq!(r["backward"], true);
            assert_eq!(r["selectedUtf16"], "62");
        }
        let state: Value = serde_json::from_str(
            &a.selection_format_state_json_guarded(&a.observe()?, "breditor/strong")?,
        )?;
        assert_eq!(state["format"], "breditor/rich-selection-format-state");
        assert_eq!(state["state"]["kind"], "unset");
        assert_eq!(saved(&a)?, cp);
        assert_eq!(a.update_frame()?, frame);
        assert_eq!(a.causal_version(), version);
    }
    let all: Value =
        serde_json::from_str(&a.selection_coverage_json_guarded(&a.observe()?, "document")?)?;
    assert_eq!(all["scope"], "document");
    assert_eq!(all["nodes"][0]["block"], "lead");
    assert!(
        all["nodes"].as_array().ok_or("nodes")?.last().ok_or("last")?["hiddenTable"]
            .as_bool()
            .ok_or("hidden")?
    );
    Ok(())
}
#[test]
fn native_selection_formatting_replays_original_annotations_in_explicit_and_typing_families()
-> Result {
    for s in [
        text("q1", 1, "task-head", 2),
        grid(),
        Selection::Node { block: "image".into() },
        Selection::Node { block: "list".into() },
    ] {
        for typing in [false, true] {
            let (p, mut a, _) = setup()?;
            if typing {
                a.enable_typing_history_guarded(&a.observe()?)?;
            }
            a.set_selection(Some(&s))?;
            let before = a.document_json().to_owned();
            assert!(a.change_selection_formats_guarded(
                &a.observe()?,
                &[RichSelectionFormatChange::Set(bold()?)]
            )?);
            assert_eq!(a.undo_count(), 1);
            assert_eq!(a.selection()?, Some(s.clone()));
            let state: Value = serde_json::from_str(
                &a.selection_format_state_json_guarded(&a.observe()?, "breditor/strong")?,
            )?;
            assert_eq!(state["state"]["kind"], "uniform");
            let checkpoint = saved(&a)?;
            assert!(!a.change_selection_formats_guarded(
                &a.observe()?,
                &[RichSelectionFormatChange::Set(bold()?)]
            )?);
            assert_eq!(saved(&a)?, checkpoint);
            let value: Value = serde_json::from_str(&checkpoint)?;
            let entries = if typing { &value["journal"]["entries"] } else { &value["entries"] };
            assert!(
                entries[0]["commands"]
                    .as_array()
                    .ok_or("commands")?
                    .iter()
                    .all(|c| c["kind"] == "set_format")
            );
            let mut b = restore(&p, &a)?;
            for redo in [false, true, false, true] {
                if redo {
                    a.redo()?;
                    b.redo()?;
                } else {
                    a.undo()?;
                    b.undo()?;
                    assert_eq!(a.document_json(), before);
                }
                assert_eq!(saved(&a)?, saved(&b)?);
            }
        }
    }
    Ok(())
}
#[test]
fn remote_source_text_and_foreign_formatting_survive_selective_history_and_restart() -> Result {
    let (p, mut a, mut b) = setup()?;
    a.set_selection(Some(&grid()))?;
    a.change_selection_formats_guarded(&a.observe()?, &[RichSelectionFormatChange::Set(bold()?)])?;
    b.apply(vec![
        Command::InsertText(InsertText { block: "p-0-0".into(), offset: 1, text: "PEER".into() }),
        Command::SetFormat(SetFormat {
            block: "p-0-0".into(),
            offset: 0,
            length: 1,
            format: json!({"type":"breditor-inline/italic","properties":{}}),
            enabled: true,
        }),
    ])?;
    sync(&mut a, &mut b)?;
    let mut c = restore(&p, &a)?;
    for redo in [false, true, false, true] {
        if redo {
            a.redo()?;
            c.redo()?;
        } else {
            a.undo()?;
            c.undo()?;
        }
        assert_eq!(saved(&a)?, saved(&c)?);
        assert!(a.document_json().contains("PEER"));
        assert!(a.document_json().contains("breditor-inline/italic"));
    }
    Ok(())
}
#[test]
fn pending_styles_are_noncausal_and_stale_readonly_code_bad_payloads_are_atomic() -> Result {
    let (_, mut a, _) = setup()?;
    a.set_selection(Some(&text("empty", 0, "empty", 0)))?;
    let frame = a.update_frame()?;
    a.change_selection_formats_guarded(&a.observe()?, &[RichSelectionFormatChange::Set(bold()?)])?;
    assert_eq!(a.undo_count(), 0);
    assert_eq!(a.update_frame()?, frame);
    assert!(a.pending_formats().is_some());
    a.set_selection(Some(&Selection::Node { block: "code".into() }))?;
    let before = saved(&a)?;
    assert!(
        a.change_selection_formats_guarded(
            &a.observe()?,
            &[RichSelectionFormatChange::Set(bold()?)]
        )
        .is_err()
    );
    assert_eq!(saved(&a)?, before);
    a.set_selection(Some(&grid()))?;
    let before = saved(&a)?;
    for input in [
        "{}",
        "{\"changes\":[]}",
        "{\"changes\":[{\"kind\":\"remove\",\"format\":\"breditor/strong\"}]}",
        "{\"changes\":[{\"kind\":\"set\",\"formatsJson\":\"[]\",\"extra\":true}]}",
    ] {
        assert!(a.change_selection_formats_json_guarded(&a.observe()?, input).is_err());
        assert_eq!(saved(&a)?, before);
    }
    let stale = a.observe()?;
    a.set_read_only_guarded(&a.observe()?, true)?;
    let before = saved(&a)?;
    assert!(a.change_selection_formats_json_guarded(&stale, "notJSON").is_err());
    assert!(
        a.change_selection_formats_guarded(
            &a.observe()?,
            &[RichSelectionFormatChange::Set(bold()?)]
        )
        .is_err()
    );
    let _ = read(&a)?;
    assert_eq!(saved(&a)?, before);
    assert!(a.selection_coverage_json_guarded(&stale, "wrong").is_err());
    Ok(())
}
#[test]
fn complete_selection_limits_and_late_missing_patch_refuse_without_partial_publication() -> Result {
    let (p, source, _) = setup()?;
    let mut input: Value = serde_json::from_str(source.document_json())?;
    input["root"]["children"].as_array_mut().ok_or("root children")?.push(fixture::element(
        "blockquote",
        "wide",
        (0..65).map(|i| fixture::paragraph(&format!("wide-{i}"), "x")).collect(),
    ));
    let mut a = p.create(&input.to_string(), "303".into())?;
    a.set_selection(Some(&Selection::Node { block: "wide".into() }))?;
    let checkpoint = saved(&a)?;
    let frame = a.update_frame()?;
    let version = a.causal_version();
    assert!(
        a.change_selection_formats_guarded(
            &a.observe()?,
            &[RichSelectionFormatChange::Set(bold()?)]
        )
        .is_err()
    );
    assert_eq!(saved(&a)?, checkpoint);
    assert_eq!(a.update_frame()?, frame);
    assert_eq!(a.causal_version(), version);
    a.set_selection(Some(&Selection::Node { block: "image".into() }))?;
    let checkpoint = saved(&a)?;
    let frame = a.update_frame()?;
    let version = a.causal_version();
    let changes=json!({"changes":[{"kind":"set","formatsJson":"[{\"type\":\"breditor/strong\",\"properties\":{}}]"},{"kind":"patch","formatsJson":"[{\"type\":\"breditor-inline/link\",\"properties\":{\"breditor-inline/href\":\"https://example.test/\",\"breditor-inline/new-window\":true}}]","properties":["breditor-inline/href"]}]}).to_string();
    assert!(a.change_selection_formats_json_guarded(&a.observe()?, &changes).is_err());
    assert_eq!(saved(&a)?, checkpoint);
    assert_eq!(a.update_frame()?, frame);
    assert_eq!(a.causal_version(), version);
    Ok(())
}
