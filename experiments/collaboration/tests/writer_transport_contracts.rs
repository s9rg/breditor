//! Authenticated-origin atomic relay admission, independent of socket or disk acknowledgements.
use breditor_collab_feasibility::{
    anchor::Affinity,
    rich_replica::{
        Command, RichReplica, SharedRichProfile, WriterGroupPreparation,
        actions::{InsertText, ResizeColumn, SetImageAlt},
        selection::{Selection, TextPoint},
    },
};
use loro::{EncodedBlobMode, LoroDoc};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::fmt::Write;
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
const A: &str = "9007199254740993";
const B: &str = "9007199254740995";
fn room() -> Result<(SharedRichProfile, String, RichReplica, RichReplica, RichReplica)> {
    let profile = SharedRichProfile::from_configuration_json(
        r#"{"format":"breditor/shared-rich-profile","formatVersion":1,"schema":{"name":"example/relay-groups","version":1},"extensions":[]}"#,
    )?;
    let root: Value = serde_json::from_str(include_str!(
        "../../../crates/breditor-core/tests/fixtures/rich-local-root.json"
    ))?;
    let input=json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/relay-groups","version":1},"schemaFingerprint":profile.schema().fingerprint().to_string(),"root":root}).to_string();
    let server = profile.create(&input, "1".into())?;
    let a = profile.join_frame("room".into(), A.into(), &server.update_frame()?)?;
    let b = profile.join_frame("room".into(), B.into(), &server.update_frame()?)?;
    Ok((profile, input, server, a, b))
}
fn insert(block: &str, text: &str) -> Command {
    Command::InsertText(InsertText { block: block.into(), offset: 0, text: text.into() })
}
fn batch(owner: &RichReplica, from: &str) -> Result<Value> {
    Ok(serde_json::from_str(&owner.writer_groups_guarded(&owner.observe()?, from)?)?)
}
fn groups(owner: &RichReplica, from: &str) -> Result<Vec<String>> {
    Ok(batch(owner, from)?["groups"]
        .as_array()
        .ok_or("groups")?
        .iter()
        .map(|v| v.as_str().map(str::to_owned).ok_or("group"))
        .collect::<std::result::Result<_, _>>()?)
}
fn commit(server: &mut RichReplica, writer: &str, input: &str) -> Result {
    let before = server.checkpoint()?;
    match server.prepare_writer_group(writer, input)? {
        WriterGroupPreparation::Prepared(p) => {
            assert_eq!(server.checkpoint()?, before);
            let checkpoint = p.checkpoint()?;
            let document = p.document_json().to_owned();
            let receipt = p.receipt().clone();
            assert_eq!(receipt, server.commit_writer_group(*p)?);
            assert_eq!(server.checkpoint()?, checkpoint);
            assert_eq!(server.document_json(), document);
        }
        _ => return Err("group did not prepare".into()),
    }
    Ok(())
}
fn payload_digest(bytes: &[u8]) -> String {
    let mut result = "sha256:".to_owned();
    for b in Sha256::digest(bytes) {
        let _ = write!(result, "{b:02x}");
    }
    result
}

#[test]
fn one_semantic_batch_is_one_authored_group_and_exports_no_other_writer_or_local_ui() -> Result {
    let (_, _, mut server, mut a, mut b) = room()?;
    a.apply(vec![
        insert("p", "Local "),
        Command::ResizeColumn(ResizeColumn {
            block: "table-block".into(),
            column: "c".into(),
            width: 320,
        }),
    ])?;
    b.apply(vec![insert("caption", "Remote ")])?;
    a.receive_frame(&b.update_frame()?)?;
    let point = TextPoint { block: "p".into(), offset: 1, affinity: Affinity::After };
    a.set_selection(Some(&Selection::TextRange { anchor: point.clone(), focus: point }))?;
    a.apply(vec![Command::SetImageAlt(SetImageAlt {
        block: "image-block".into(),
        text: "Description".into(),
        decorative: false,
    })])?;
    a.undo()?;
    a.redo()?;
    let packet = groups(&a, "0")?;
    assert_eq!(packet.len(), 4);
    let observation = a.observe()?;
    let unchanged = a.checkpoint()?;
    for group in &packet {
        let raw: Value = serde_json::from_str(group)?;
        assert_eq!(raw["writer"], A);
        assert_eq!(raw["kind"], "action");
        let bytes: Vec<u8> = serde_json::from_value(raw["bytes"].clone())?;
        let meta = LoroDoc::decode_import_blob_meta(&bytes, true)?;
        assert_eq!(meta.mode, EncodedBlobMode::Updates);
        assert!(meta.partial_end_vv.iter().all(|(id, _)| id.to_string() == A));
    }
    assert_eq!(a.checkpoint()?, unchanged);
    a.check(&observation)?;
    commit(&mut server, A, &packet[0])?;
    assert!(matches!(
        server.prepare_writer_group(A, &packet[1])?,
        WriterGroupPreparation::Pending { .. }
    ));
    commit(&mut server, B, &groups(&b, "0")?[0])?;
    for group in packet.iter().skip(1) {
        commit(&mut server, A, group)?;
    }
    assert_eq!(a.document_json(), server.document_json());
    assert_eq!(a.writer_clock(A)?, server.writer_clock(A)?);
    assert_eq!(server.undo_count(), 0);
    Ok(())
}

#[test]
fn duplicate_groups_are_exact_noops_and_divergent_writer_history_is_not_merged() -> Result {
    let (profile, _, mut server, mut a, _) = room()?;
    let origin = a.checkpoint()?;
    a.apply(vec![insert("p", "A")])?;
    let first = groups(&a, "0")?[0].clone();
    commit(&mut server, A, &first)?;
    let before = server.checkpoint()?;
    let observation = server.observe()?;
    assert!(matches!(
        server.prepare_writer_group(A, &first)?,
        WriterGroupPreparation::Duplicate(_)
    ));
    assert_eq!(server.checkpoint()?, before);
    server.check(&observation)?;
    let mut fork = profile.restore("room", &origin)?;
    fork.apply(vec![insert("p", "B")])?;
    assert!(server.prepare_writer_group(A, &groups(&fork, "0")?[0]).is_err());
    let next = fork.writer_clock(A)?.through;
    fork.apply(vec![insert("caption", "Next")])?;
    assert!(server.prepare_writer_group(A, &groups(&fork, &next)?[0]).is_err());
    assert_eq!(server.checkpoint()?, before);
    Ok(())
}

#[test]
fn missing_dependencies_and_own_gaps_stay_outside_the_live_causal_history() -> Result {
    let (_, _, mut server, mut a, mut b) = room()?;
    a.apply(vec![insert("p", "A")])?;
    let first = groups(&a, "0")?[0].clone();
    b.receive_frame(&a.update_frame()?)?;
    b.apply(vec![insert("caption", "B")])?;
    a.receive_frame(&b.update_frame()?)?;
    a.apply(vec![insert("p", "Again")])?;
    let packets = groups(&a, "0")?;
    let remote = groups(&b, "0")?[0].clone();
    let before = server.checkpoint()?;
    assert!(matches!(
        server.prepare_writer_group(A, &packets[1])?,
        WriterGroupPreparation::Pending { .. }
    ));
    assert!(matches!(
        server.prepare_writer_group(B, &remote)?,
        WriterGroupPreparation::Pending { .. }
    ));
    assert_eq!(server.checkpoint()?, before);
    commit(&mut server, A, &first)?;
    commit(&mut server, B, &remote)?;
    commit(&mut server, A, &packets[1])?;
    assert_eq!(server.document_json(), a.document_json());
    Ok(())
}

#[test]
fn undeclared_pending_dependencies_cannot_poison_a_later_valid_authors_import() -> Result {
    let (_, _, mut server, mut a, mut b) = room()?;
    b.apply(vec![insert("caption", "Dependency ")])?;
    a.receive_frame(&b.update_frame()?)?;
    a.apply(vec![insert("p", "Dependent ")])?;
    let valid = groups(&a, "0")?[0].clone();
    let mut missing: Value = serde_json::from_str(&valid)?;
    missing["dependencies"] = json!([]);
    let before = server.checkpoint()?;
    assert!(server.prepare_writer_group(A, &missing.to_string()).is_err());
    assert_eq!(server.checkpoint()?, before);
    assert_eq!(server.writer_clock(A)?.through, "0");
    commit(&mut server, B, &groups(&b, "0")?[0])?;
    commit(&mut server, A, &valid)?;
    assert_eq!(server.document_json(), a.document_json());
    Ok(())
}

#[test]
fn auth_binding_payload_integrity_and_single_engine_origin_are_checked_before_adoption() -> Result {
    let (_, _, server, mut a, mut b) = room()?;
    a.apply(vec![insert("p", "A")])?;
    b.apply(vec![insert("caption", "B")])?;
    a.receive_frame(&b.update_frame()?)?;
    let packet = groups(&a, "0")?[0].clone();
    let before = server.checkpoint()?;
    assert!(server.prepare_writer_group(B, &packet).is_err());
    for (field, value) in [
        ("document", json!("other")),
        ("modelVersion", json!(999)),
        ("from", json!("00")),
        ("through", json!("1")),
        ("groupDigest", json!("bad")),
    ] {
        let mut p: Value = serde_json::from_str(&packet)?;
        p[field] = value;
        assert!(server.prepare_writer_group(A, &p.to_string()).is_err());
    }
    let mut altered: Value = serde_json::from_str(&packet)?;
    altered["bytes"][0] = json!(255);
    assert!(server.prepare_writer_group(A, &altered.to_string()).is_err());
    let mut full: Value = serde_json::from_str(&packet)?;
    let bytes = a.updates()?;
    full["payloadDigest"] = json!(payload_digest(&bytes));
    full["bytes"] = json!(bytes);
    assert!(server.prepare_writer_group(A, &full.to_string()).is_err());
    assert_eq!(server.checkpoint()?, before);
    Ok(())
}

#[test]
fn prepared_admission_is_unpublished_and_fenced_by_the_exact_original_observation() -> Result {
    let (profile, input, mut server, mut a, _) = room()?;
    a.apply(vec![insert("p", "A")])?;
    let group = groups(&a, "0")?[0].clone();
    let WriterGroupPreparation::Prepared(p) = server.prepare_writer_group(A, &group)? else {
        return Err("not prepared".into());
    };
    assert_ne!(p.document_json(), server.document_json());
    server.set_selection(Some(&Selection::Node { block: "image-block".into() }))?;
    let before = server.checkpoint()?;
    assert!(server.commit_writer_group(*p).is_err());
    assert_eq!(server.checkpoint()?, before);
    let WriterGroupPreparation::Prepared(p) = server.prepare_writer_group(A, &group)? else {
        return Err("not prepared".into());
    };
    let mut foreign = profile.create(&input, "1".into())?;
    let before = foreign.checkpoint()?;
    assert!(foreign.commit_writer_group(*p).is_err());
    assert_eq!(foreign.checkpoint()?, before);
    Ok(())
}

#[test]
fn exact_journal_recovery_rebuilds_identical_authored_windows_and_canonical_lineage() -> Result {
    let (profile, _, mut server, mut a, mut b) = room()?;
    a.apply(vec![insert("p", "A")])?;
    b.receive_frame(&a.update_frame()?)?;
    b.apply(vec![insert("caption", "B")])?;
    a.receive_frame(&b.update_frame()?)?;
    a.apply(vec![insert("p", "Next")])?;
    a.undo()?;
    a.redo()?;
    let restored = profile.restore("room", &a.checkpoint()?)?;
    assert_eq!(a.writer_clock(A)?, restored.writer_clock(A)?);
    let x = groups(&a, "0")?;
    let y = groups(&restored, "0")?;
    assert_eq!(x.len(), y.len());
    for (a, b) in x.iter().zip(&y) {
        let mut a: Value = serde_json::from_str(a)?;
        let mut b: Value = serde_json::from_str(b)?;
        for p in [&mut a, &mut b] {
            p.as_object_mut().ok_or("group")?.remove("bytes");
            p.as_object_mut().ok_or("group")?.remove("payloadDigest");
        }
        assert_eq!(a, b);
    }
    commit(&mut server, A, &x[0])?;
    assert!(matches!(server.prepare_writer_group(A, &y[0])?, WriterGroupPreparation::Duplicate(_)));
    commit(&mut server, B, &groups(&b, "0")?[0])?;
    for group in y.iter().skip(1) {
        commit(&mut server, A, group)?;
    }
    assert_eq!(server.document_json(), restored.document_json());
    Ok(())
}

#[test]
fn batch_continuation_never_splits_an_authored_group_and_ui_only_work_is_not_exported() -> Result {
    let (_, _, _, mut a, _) = room()?;
    for _ in 0..65 {
        a.apply(vec![insert("p", "x")])?;
    }
    let first = batch(&a, "0")?;
    assert_eq!(first["groups"].as_array().ok_or("groups")?.len(), 64);
    assert_eq!(first["hasMore"], true);
    let through = first["through"].as_str().ok_or("through")?;
    let second = batch(&a, through)?;
    assert_eq!(second["groups"].as_array().ok_or("groups")?.len(), 1);
    assert_eq!(second["hasMore"], false);
    let tail = second["through"].as_str().ok_or("through")?;
    assert_eq!(groups(&a, tail)?.len(), 0);
    a.set_selection(Some(&Selection::Node { block: "image-block".into() }))?;
    assert_eq!(groups(&a, tail)?.len(), 0);
    assert!(batch(&a, "1").is_err());
    assert!(batch(&a, "2147483647").is_err());
    Ok(())
}

#[test]
fn genesis_is_explicit_and_cannot_be_submitted_as_an_ordinary_edit_to_an_existing_room() -> Result {
    let (profile, input, _, _, _) = room()?;
    let seed = profile.create(&input, "7".into())?;
    let server = profile.create(&input, "1".into())?;
    let packet = groups(&seed, "0")?;
    assert_eq!(packet.len(), 1);
    assert_eq!(serde_json::from_str::<Value>(&packet[0])?["kind"], "genesis");
    assert!(server.prepare_writer_group("7", &packet[0]).is_err());
    let mut fresh: Value = serde_json::from_str(&input)?;
    fresh["root"]["children"] = json!([{"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{"breditor/block-id":"fresh-seed"},"children":[{"kind":"text","text":"New seed","formats":[]}]}]);
    let fresh = profile.create(&fresh.to_string(), "7".into())?;
    let mut relabeled: Value = serde_json::from_str(&groups(&fresh, "0")?[0])?;
    relabeled["kind"] = json!("action");
    assert!(
        server.prepare_writer_group("7", &relabeled.to_string()).is_err(),
        "relabeling initialization must not grant ordinary edit authority"
    );
    Ok(())
}

#[test]
fn stale_export_observations_reject_before_a_malformed_cursor_without_changing_state() -> Result {
    let (_, _, _, mut a, b) = room()?;
    let old = a.observe()?;
    a.apply(vec![insert("p", "A")])?;
    let before = a.checkpoint()?;
    assert!(a.writer_groups_guarded(&old, "not a counter").is_err());
    assert!(a.writer_groups_guarded(&b.observe()?, "0").is_err());
    assert_eq!(a.checkpoint()?, before);
    Ok(())
}
