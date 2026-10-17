//! Only genuine empty normalization floors can omit a not-yet-activated native text root.
use super::capture;
use loro::LoroDoc;
use serde_json::json;
type Result = std::result::Result<(), Box<dyn std::error::Error>>;
#[test]
fn unactivated_empty_floor_has_the_same_character_witness_after_pure_root_activation() -> Result {
    let doc = LoroDoc::new();
    let block = "breditor-virtual:test-floor";
    let node =
        json!({"type":"breditor/paragraph","properties":{"breditor/block-id":block},"children":[]});
    let before = doc.oplog_vv();
    let original = capture(&doc, block, &node)?;
    for kind in ["breditor/heading", "breditor/code-block"] {
        let mut converted = node.clone();
        converted["type"] = kind.into();
        assert_eq!(capture(&doc, block, &converted)?, original);
    }
    assert_eq!(doc.oplog_vv(), before);
    crate::rich_replica::model::text(&doc, block)?;
    doc.commit();
    assert_eq!(capture(&doc, block, &node)?, original);
    crate::rich_replica::text_flow::prepare_root(&doc, block)?;
    doc.commit();
    assert_eq!(capture(&doc, block, &node)?, original);
    Ok(())
}
#[test]
fn missing_real_nonempty_or_mismatched_flows_never_become_empty_witnesses() -> Result {
    let doc = LoroDoc::new();
    let real = json!({"type":"breditor/paragraph","properties":{"breditor/block-id":"ordinary"},"children":[]});
    assert!(capture(&doc, "ordinary", &real).is_err());
    let block = "breditor-virtual:test-floor";
    let nonempty = json!({"type":"breditor/paragraph","properties":{"breditor/block-id":block},"children":[{"kind":"text","text":"A","formats":[]}]});
    assert!(capture(&doc, block, &nonempty).is_err());
    let mismatched = json!({"type":"breditor/paragraph","properties":{"breditor/block-id":"breditor-virtual:different"},"children":[]});
    assert!(capture(&doc, block, &mismatched).is_err());
    let not_text =
        json!({"type":"breditor/image","properties":{"breditor/block-id":block},"children":[]});
    assert!(capture(&doc, block, &not_text).is_err());
    assert!(doc.oplog_vv().is_empty());
    crate::rich_replica::model::text(&doc, block)?.insert(0, "A")?;
    doc.commit();
    let empty =
        json!({"type":"breditor/paragraph","properties":{"breditor/block-id":block},"children":[]});
    assert!(
        capture(&doc, block, &empty).is_err(),
        "A known nonempty native text cannot masquerade as an empty derived source"
    );
    Ok(())
}
