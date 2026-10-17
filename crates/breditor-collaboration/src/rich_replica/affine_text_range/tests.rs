//! Rehashed wrappers cannot replace historical-source admission with weaker caller claims.
use super::packet::{Packet, digest};
use crate::anchor::Affinity;
use crate::rich_replica::{
    Command, ReviewAnchorTarget, RichReplica, SharedRichProfile,
    actions::InsertText,
    selection::{Selection, TextPoint},
};
use serde_json::{Value, json};
type Result = std::result::Result<(), Box<dyn std::error::Error>>;
fn owner() -> std::result::Result<RichReplica, Box<dyn std::error::Error>> {
    let p = SharedRichProfile::from_standard_configuration_json_v3(
        r#"{"format":"breditor/shared-rich-profile","formatVersion":3,"schema":{"name":"example/affine-private","version":1},"extensions":[]}"#,
    )?;
    let root: Value = serde_json::from_str(include_str!(
        "../../../../breditor-core/tests/fixtures/rich-local-root.json"
    ))?;
    Ok(p.create(&json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/affine-private","version":1},"schemaFingerprint":p.schema().fingerprint().to_string(),"root":root}).to_string(),"101".into())?)
}
fn selection() -> Selection {
    Selection::TextRange {
        anchor: TextPoint { block: "p".into(), offset: 1, affinity: Affinity::After },
        focus: TextPoint { block: "p".into(), offset: 3, affinity: Affinity::Before },
    }
}
#[test]
fn rehashed_current_valid_coordinates_cannot_override_an_invalid_original_source_range() -> Result {
    let mut a = owner()?;
    let packet = a.capture_affine_text_range_guarded(&a.observe()?, &selection())?;
    a.apply(vec![Command::InsertText(InsertText {
        block: "p".into(),
        offset: 0,
        text: "Prefix ".into(),
    })])?;
    let mut value: Packet = serde_json::from_str(&packet)?;
    let Selection::TextRange { focus, .. } = &mut value.data.selection else {
        return Err("text".into());
    };
    focus.offset = 2;
    value.id = digest(&value.data)?;
    let forged = serde_json::to_string(&value)?;
    a.read_affine_text_range(&forged)?;
    assert!(
        a.resolve_affine_text_range(&forged).is_err(),
        "descriptive metadata is not a source proof"
    );
    Ok(())
}
#[test]
fn rehashed_non_document_source_and_changed_family_or_unknown_witness_fields_refuse() -> Result {
    let a = owner()?;
    let packet = a.capture_affine_text_range_guarded(&a.observe()?, &selection())?;
    let mut value: Packet = serde_json::from_str(&packet)?;
    value.data.source_anchor_json = a.capture_review_anchor_guarded(
        &a.observe()?,
        &ReviewAnchorTarget::Selection(selection()),
    )?;
    value.id = digest(&value.data)?;
    assert!(a.read_affine_text_range(&serde_json::to_string(&value)?).is_err());
    let mut value: Packet = serde_json::from_str(&packet)?;
    value.data.format_version = 2;
    value.id = digest(&value.data)?;
    assert!(a.read_affine_text_range(&serde_json::to_string(&value)?).is_err());
    let mut extra: Value = serde_json::from_str(&packet)?;
    extra["data"]["characters"] = json!([]);
    assert!(a.read_affine_text_range(&extra.to_string()).is_err());
    assert!(a.read_affine_text_range(&" ".repeat(super::MAX_BYTES + 1)).is_err());
    Ok(())
}
#[test]
fn a_valid_rehashed_digest_cannot_substitute_another_original_document_witness() -> Result {
    let a = owner()?;
    let packet = a.capture_affine_text_range_guarded(&a.observe()?, &selection())?;
    let mut value: Packet = serde_json::from_str(&packet)?;
    value.data.source_document_digest = format!("sha256:{}", "0".repeat(64));
    value.id = digest(&value.data)?;
    let forged = serde_json::to_string(&value)?;
    a.read_affine_text_range(&forged)?;
    assert!(a.resolve_affine_text_range(&forged).is_err());
    Ok(())
}
