//! Historical reads prove a native causal cut and never mutate current content or either history.
use breditor_collaboration::{
    Error,
    anchor::Affinity,
    rich_replica::{
        Command, DocumentVersionSource, ReviewAnchorQuote as Quote, ReviewAnchorTarget as Target,
        RichReplica, SharedRichProfile,
        actions::{DeleteBlock, DeleteText, InsertText, SplitTextBlock},
        selection::{CellTarget, Selection, TextPoint},
    },
};
use breditor_core::rich_content::review::ReviewPrincipalId;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;

fn peers() -> Result<(SharedRichProfile, RichReplica, RichReplica)> {
    let root: Value = serde_json::from_str(include_str!(
        "../../breditor-core/tests/fixtures/rich-local-root.json"
    ))?;
    peers_from_root(&root)
}
fn peers_from_root(root: &Value) -> Result<(SharedRichProfile, RichReplica, RichReplica)> {
    let p = SharedRichProfile::from_standard_configuration_json_v3(
        r#"{"format":"breditor/shared-rich-profile","formatVersion":3,"schema":{"name":"example/historical-review","version":1},"extensions":[]}"#,
    )?;
    let input = json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/historical-review","version":1},"schemaFingerprint":p.schema().fingerprint().to_string(),"root":root}).to_string();
    let a = p.create(&input, "9007199254740993".into())?;
    let b = p.join_frame("room".into(), "3".into(), &a.update_frame()?)?;
    Ok((p, a, b))
}
fn point(block: &str, offset: u32) -> TextPoint {
    TextPoint { block: block.into(), offset, affinity: Affinity::After }
}
fn text(block: &str, from: u32, to: u32) -> Target {
    Target::Selection(Selection::TextRange { anchor: point(block, from), focus: point(block, to) })
}
fn anchor(a: &RichReplica, target: &Target) -> Result<String> {
    Ok(a.capture_review_anchor_guarded(&a.observe()?, target)?)
}
fn version(a: &RichReplica) -> Result<String> {
    Ok(a.capture_document_version_guarded(
        &a.observe()?,
        "Captured source",
        ReviewPrincipalId::try_new("alice")?,
        "1792200000000",
    )?)
}
fn insert(value: &str) -> Command {
    Command::InsertText(InsertText { block: "p".into(), offset: 0, text: value.into() })
}
fn quoted(value: &str) -> Quote {
    Quote::Quoted { plain_text: value.into() }
}

#[test]
fn original_unicode_quote_survives_deleted_target_split_undo_and_exact_recovery() -> Result {
    for document in [false, true] {
        for natural in [false, true] {
            let (profile, mut a, _) = peers()?;
            if document {
                a.enable_document_selection_guarded(&a.observe()?)?;
            }
            if natural {
                a.enable_typing_history_guarded(&a.observe()?)?;
            }
            let original = anchor(&a, &text("p", 3, 1))?;
            assert_eq!(a.read_review_quote(&original)?, quoted("🙂"));
            a.apply(vec![Command::SplitTextBlock(SplitTextBlock {
                block: "p".into(),
                offset: 1,
                right: "right".into(),
                right_heading: None,
            })])?;
            a.apply(vec![Command::DeleteBlock(DeleteBlock { block: "right".into() })])?;
            assert_eq!(a.read_review_quote(&original)?, quoted("🙂"));
            let saved = match (document, natural) {
                (true, true) => a.document_typing_checkpoint()?,
                (true, false) => a.document_checkpoint()?,
                (false, true) => a.typing_checkpoint()?,
                (false, false) => a.checkpoint()?,
            };
            let mut restored = match (document, natural) {
                (true, true) => profile.restore_document_typing("room", &saved)?,
                (true, false) => profile.restore_document("room", &saved)?,
                (false, true) => profile.restore_typing("room", &saved)?,
                (false, false) => profile.restore("room", &saved)?,
            };
            assert_eq!(restored.read_review_quote(&original)?, quoted("🙂"));
            for _ in 0..2 {
                a.undo()?;
                restored.undo()?;
                assert_eq!(a.read_review_quote(&original)?, quoted("🙂"));
                assert_eq!(restored.document_json(), a.document_json());
            }
            a.redo()?;
            restored.redo()?;
            assert_eq!(restored.read_review_quote(&original)?, quoted("🙂"));
        }
    }
    Ok(())
}

#[test]
fn quotes_are_pure_read_only_directional_and_explicit_for_carets_and_document_discussions() -> Result
{
    let (_, mut a, _) = peers()?;
    let caret = anchor(&a, &text("p", 1, 1))?;
    let caption = anchor(&a, &text("caption", 4, 0))?;
    let discussion = anchor(&a, &Target::Document)?;
    a.apply(vec![insert("Later ")])?;
    a.set_read_only_guarded(&a.observe()?, true)?;
    let observed = a.observe()?;
    let before = (a.checkpoint()?, a.view_json()?, a.update_frame()?);
    assert_eq!(a.read_review_quote(&caret)?, quoted(""));
    assert_eq!(a.read_review_quote(&caption)?, quoted("xy🙂"));
    assert_eq!(a.read_review_quote(&discussion)?, Quote::Document);
    assert_eq!((a.checkpoint()?, a.view_json()?, a.update_frame()?), before);
    a.check(&observed)?;
    Ok(())
}

#[test]
fn node_and_grid_original_quotes_do_not_substitute_the_later_document() -> Result {
    let (_, mut a, _) = peers()?;
    let cell = CellTarget { table: "t".into(), row: "r".into(), column: "c".into() };
    let grid =
        anchor(&a, &Target::Selection(Selection::Grid { anchor: cell.clone(), focus: cell }))?;
    let node = anchor(&a, &Target::Selection(Selection::Node { block: "image-block".into() }))?;
    let original_grid = a.read_review_quote(&grid)?;
    let original_node = a.read_review_quote(&node)?;
    assert!(
        matches!(&original_grid, Quote::Quoted {plain_text} if plain_text.contains("a🙂b") && plain_text.contains("xy🙂"))
    );
    assert!(matches!(&original_node, Quote::Quoted {plain_text} if plain_text.contains("xy🙂")));
    a.apply(vec![Command::DeleteBlock(DeleteBlock { block: "table-block".into() })])?;
    assert_eq!(a.read_review_quote(&grid)?, original_grid);
    assert_eq!(a.read_review_quote(&node)?, original_node);
    Ok(())
}

#[test]
fn original_cross_cell_quotes_keep_only_selected_text_and_native_table_separators() -> Result {
    let mut root: Value = serde_json::from_str(include_str!(
        "../../breditor-core/tests/fixtures/rich-local-root.json"
    ))?;
    root["children"][0]["properties"]["breditor/columns"]
        .as_array_mut()
        .ok_or("columns")?
        .push(json!({"id":"second-column","width":120}));
    root["children"][0]["children"][0]["children"].as_array_mut().ok_or("cells")?.push(json!({
        "kind":"element","type":"breditor/table-cell","entityId":null,
        "properties":{"breditor/block-id":"second-cell","breditor/column-id":"second-column","breditor/header":false},
        "children":[{"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{"breditor/block-id":"second-text"},"children":[{"kind":"text","text":"Tail🙂!","formats":[]}]}]
    }));
    let (_, mut a, _) = peers_from_root(&root)?;
    let selected = Target::Selection(Selection::TextRange {
        anchor: point("caption", 2),
        focus: point("second-text", 4),
    });
    let original = anchor(&a, &selected)?;
    assert_eq!(a.read_review_quote(&original)?, quoted("🙂\tTail"));
    a.apply(vec![Command::DeleteBlock(DeleteBlock { block: "table-block".into() })])?;
    assert_eq!(a.read_review_quote(&original)?, quoted("🙂\tTail"));
    Ok(())
}

#[test]
fn missing_source_history_is_pending_for_both_quotes_and_versions_until_native_catchup() -> Result {
    let (_, mut a, mut b) = peers()?;
    b.apply(vec![insert("Peer ")])?;
    let original = anchor(&b, &text("p", 0, 5))?;
    let saved = version(&b)?;
    let before = a.checkpoint()?;
    assert_eq!(a.read_review_quote(&original)?, Quote::Pending);
    assert!(
        matches!(a.verify_document_version_source(&saved)?, DocumentVersionSource::Pending {missing, ..} if missing.len() == 1 && missing[0].writer == "3")
    );
    assert_eq!(a.checkpoint()?, before);
    a.receive_frame(&b.update_frame()?)?;
    assert_eq!(a.read_review_quote(&original)?, quoted("Peer "));
    assert!(
        matches!(a.verify_document_version_source(&saved)?, DocumentVersionSource::Verified {clocks, ..} if clocks.len() == 2 && clocks[0].writer == "3" && clocks[1].writer == "9007199254740993")
    );
    Ok(())
}

#[test]
fn oversized_original_quotes_are_explicitly_unavailable_not_silently_truncated() -> Result {
    use breditor_collaboration::rich_replica::ReviewQuoteLoss;
    let (_, mut a, _) = peers()?;
    // Each ordinary insertion retains its existing 32 KiB input ceiling.
    a.apply(vec![
        insert(&"x".repeat(24 * 1024)),
        insert(&"x".repeat(24 * 1024)),
        insert(&"x".repeat(24 * 1024)),
    ])?;
    let at_limit = anchor(&a, &text("p", 0, 64 * 1024))?;
    let over_limit = anchor(&a, &text("p", 0, 64 * 1024 + 1))?;
    assert_eq!(a.read_review_quote(&at_limit)?, quoted(&"x".repeat(64 * 1024)));
    assert_eq!(
        a.read_review_quote(&over_limit)?,
        Quote::Unavailable { reason: ReviewQuoteLoss::TooLarge }
    );
    Ok(())
}

#[test]
fn source_proof_reconstructs_formatted_table_and_image_properties_not_just_plain_text() -> Result {
    use breditor_collaboration::rich_replica::actions::{
        ResizeColumn, ResizeImage, SetFormat, SetHeading,
    };
    let (_, mut a, mut b) = peers()?;
    a.apply(vec![
        Command::SetHeading(SetHeading { block: "p".into(), level: Some(2) }),
        Command::ResizeImage(ResizeImage { block: "image-block".into(), size: Some([320, 180]) }),
        Command::ResizeColumn(ResizeColumn {
            block: "table-block".into(),
            column: "c".into(),
            width: 240,
        }),
        Command::SetFormat(SetFormat {
            block: "caption".into(),
            offset: 0,
            length: 2,
            format: json!({"type":"breditor/strong","properties":{}}),
            enabled: true,
        }),
    ])?;
    let captured = version(&a)?;
    let original_quote = anchor(&a, &text("p", 0, 4))?;
    b.receive_frame(&a.update_frame()?)?;
    b.apply(vec![insert("Newer peer work ")])?;
    a.receive_frame(&b.update_frame()?)?;
    assert!(matches!(
        a.verify_document_version_source(&captured)?,
        DocumentVersionSource::Verified { .. }
    ));
    assert_eq!(
        a.verify_document_version_source(&captured)?,
        b.verify_document_version_source(&captured)?
    );
    assert_eq!(a.read_review_quote(&original_quote)?, quoted("a🙂b"));
    a.undo()?;
    assert!(matches!(
        a.verify_document_version_source(&captured)?,
        DocumentVersionSource::Verified { .. }
    ));
    assert_eq!(a.read_review_quote(&original_quote)?, quoted("a🙂b"));
    Ok(())
}

#[test]
fn every_open_style_mark_cut_rejects_before_historical_engine_fork_without_poisoning_the_owner()
-> Result {
    use loro::{IdSpan, JsonOpContent, JsonTextOp, LoroDoc};
    let (_, mut a, _) = peers()?;
    a.apply(vec![insert("Inherited strong formatting ")])?;
    let frame: Value = serde_json::from_str(&a.update_frame()?)?;
    let bytes: Vec<u8> = serde_json::from_value(frame["bytes"].clone())?;
    let engine = LoroDoc::new();
    engine.import(&bytes)?;
    let original = anchor(&a, &Target::Document)?;
    let saved = version(&a)?;
    let before = (a.checkpoint()?, a.view_json()?, a.update_frame()?);
    let observed = a.observe()?;
    let mut refused = 0;
    for (writer, through) in engine.state_vv().iter() {
        let writer_key = writer.to_string();
        for op in engine
            .export_json_in_id_span(IdSpan::new(*writer, 0, *through))
            .iter()
            .flat_map(|change| &change.ops)
        {
            if !matches!(op.content, JsonOpContent::Text(JsonTextOp::Mark { .. })) {
                continue;
            }
            let mut source: Value = serde_json::from_str(&original)?;
            let clock = source["clocks"]
                .as_array_mut()
                .ok_or("clocks")?
                .iter_mut()
                .find(|clock| clock["writer"].as_str() == Some(writer_key.as_str()))
                .ok_or("writer")?;
            clock["counter"] = (op.counter + 1).to_string().into();
            assert!(matches!(
                a.read_review_quote(&source.to_string()),
                Err(Error::Contract("review source cut splits text mark"))
            ));
            let mut candidate: Value = serde_json::from_str(&saved)?;
            candidate["data"]["sourceAnchorJson"] = source.to_string().into();
            assert!(matches!(
                a.verify_document_version_source(&rehash(candidate)?),
                Err(Error::Contract("review source cut splits text mark"))
            ));
            refused += 1;
        }
    }
    assert!(refused > 0);
    assert_eq!((a.checkpoint()?, a.view_json()?, a.update_frame()?), before);
    a.check(&observed)?;
    assert!(matches!(
        a.verify_document_version_source(&saved)?,
        DocumentVersionSource::Verified { .. }
    ));
    Ok(())
}

// Rehashing is deliberately available to any host. Digest validity alone cannot prove source content.
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VersionData {
    format: String,
    format_version: u32,
    name: String,
    author: String,
    created_at_ms: String,
    source_anchor_json: String,
    document_json: String,
}
fn rehash(mut packet: Value) -> Result<String> {
    use sha2::{Digest, Sha256};
    use std::fmt::Write as _;
    let data: VersionData = serde_json::from_value(packet["data"].clone())?;
    let bytes = serde_json::to_vec(&data)?;
    let mut digest = String::from("sha256:");
    for byte in
        Sha256::new().chain_update(b"breditor/document-version/1\0").chain_update(bytes).finalize()
    {
        write!(digest, "{byte:02x}")?;
    }
    packet["id"] = digest.into();
    Ok(packet.to_string())
}

#[test]
fn source_proof_verifies_old_revisions_without_rewinding_or_trusting_rehashed_content_claims()
-> Result {
    let (profile, mut a, _) = peers()?;
    let saved = version(&a)?;
    a.apply(vec![insert("Later document ")])?;
    let current = version(&a)?;
    a.set_read_only_guarded(&a.observe()?, true)?;
    let exact = (a.checkpoint()?, a.view_json()?, a.update_frame()?);
    let observed = a.observe()?;
    assert!(matches!(
        a.verify_document_version_source(&saved)?,
        DocumentVersionSource::Verified { .. }
    ));
    let restored = profile.restore("room", &a.checkpoint()?)?;
    assert_eq!(
        restored.verify_document_version_source(&saved)?,
        a.verify_document_version_source(&saved)?
    );
    let old: Value = serde_json::from_str(&saved)?;
    let mut forged: Value = serde_json::from_str(&current)?;
    forged["data"]["sourceAnchorJson"] = old["data"]["sourceAnchorJson"].clone();
    let forged = rehash(forged)?;
    assert!(a.read_document_version(&forged).is_ok());
    assert!(matches!(
        a.verify_document_version_source(&forged),
        Err(Error::Contract("version content differs from its historical source cut"))
    ));
    assert_eq!((a.checkpoint()?, a.view_json()?, a.update_frame()?), exact);
    a.check(&observed)?;
    Ok(())
}

#[test]
fn source_cut_must_be_causally_closed_and_target_must_exist_at_capture_not_just_now() -> Result {
    let (_, mut a, mut b) = peers()?;
    b.apply(vec![insert("Depends on genesis ")])?;
    a.receive_frame(&b.update_frame()?)?;
    let saved = version(&a)?;
    let mut bad: Value = serde_json::from_str(&saved)?;
    let mut source: Value =
        serde_json::from_str(bad["data"]["sourceAnchorJson"].as_str().ok_or("source")?)?;
    source["clocks"] = json!([{"writer":"3","counter":source["clocks"][0]["counter"]}]);
    bad["data"]["sourceAnchorJson"] = source.to_string().into();
    let before = a.checkpoint()?;
    assert!(a.verify_document_version_source(&rehash(bad)?).is_err());
    assert!(a.read_review_quote(&source.to_string()).is_err());
    let mut old_target: Value = serde_json::from_str(&anchor(
        &a,
        &Target::Selection(Selection::Node { block: "image-block".into() }),
    )?)?;
    old_target["anchors"]["block"] = "not-born-at-capture".into();
    assert!(a.read_review_quote(&old_target.to_string()).is_err());
    a.apply(vec![Command::DeleteText(DeleteText { block: "p".into(), offset: 0, length: 1 })])?;
    assert_ne!(a.checkpoint()?, before);
    Ok(())
}
