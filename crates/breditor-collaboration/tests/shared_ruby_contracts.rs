//! Opt-in ruby (furigana) extension in shared V4 rooms: the shared configuration compiles to the
//! same fingerprint as the local ruby profile, the generic `SetFormat` sets/replaces/removes a
//! reading in one writer-local Undo step, peers converge, typing never inherits a reading and a
//! checkpoint replays the history exactly. No grammar, causal model or journal change.
use breditor_collaboration::{
    anchor::Affinity,
    rich_replica::{
        Command, RichReplica, SharedRichProfile,
        actions::{InsertText, SetFormat},
        selection::{Selection, TextPoint},
    },
};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;

const RUBY: &str = "breditor-ruby/ruby";
/// `breditor-editor/standard@4` + standard inline preset V1 + ruby V1 (`rubySchemaFingerprintV4`).
const RUBY_STANDARD_FINGERPRINT: &str =
    "sha256:59b7d3c1fcbe2e85e23e526198312400e5732579d957a244d622c60a61194833";

fn config(ruby: bool) -> String {
    let extensions = if ruby {
        json!([{"id":{"name":RUBY,"version":1},"dependencies":[],"conflicts":[],"formats":[{"kind":RUBY,"revision":1,"properties":[{"name":"breditor-ruby/annotation","presence":"required","valueType":{"kind":"string","minimumUtf8Bytes":1,"maximumUtf8Bytes":256}}]}]}])
    } else {
        json!([])
    };
    json!({"format":"breditor/shared-rich-profile","formatVersion":4,"schema":{"name":"breditor-editor/standard","version":4},"extensions":extensions}).to_string()
}
fn ruby(annotation: &str) -> Value {
    json!({"type":RUBY,"properties":{"breditor-ruby/annotation":annotation}})
}
fn source(p: &SharedRichProfile, runs: &Value) -> String {
    json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"breditor-editor/standard","version":4},"schemaFingerprint":p.schema().fingerprint().to_string(),
        "root":{"kind":"element","type":"breditor/document","entityId":null,"properties":{"breditor/document-id":"room"},"children":[
            {"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{"breditor/block-id":"p"},"children":runs}]}}).to_string()
}
fn runs(a: &RichReplica) -> Result<Value> {
    Ok(serde_json::from_str::<Value>(a.document_json())?["root"]["children"][0]["children"].clone())
}
fn set(offset: u32, length: u32, format: Value, enabled: bool) -> Command {
    Command::SetFormat(SetFormat { block: "p".into(), offset, length, format, enabled })
}
fn caret(offset: u32) -> Selection {
    let point = TextPoint { block: "p".into(), offset, affinity: Affinity::After };
    Selection::TextRange { anchor: point.clone(), focus: point }
}
fn sync(a: &mut RichReplica, b: &mut RichReplica) -> Result {
    let (x, y) = (a.update_frame()?, b.update_frame()?);
    a.receive_frame(&y)?;
    b.receive_frame(&x)?;
    assert_eq!(a.document_json(), b.document_json());
    Ok(())
}

#[test]
fn the_shared_ruby_profile_is_the_local_ruby_profile_and_others_refuse_its_documents() -> Result {
    let with = SharedRichProfile::from_standard_configuration_json_v4(&config(true))?;
    let without = SharedRichProfile::from_standard_configuration_json_v4(&config(false))?;
    assert_eq!(with.schema().fingerprint().to_string(), RUBY_STANDARD_FINGERPRINT);
    assert_ne!(without.schema().fingerprint(), with.schema().fingerprint());
    let content = json!([{"kind":"text","text":"漢字","formats":[ruby("かんじ")]}]);
    with.create(&source(&with, &content), "101".into())?;
    assert!(without.create(&source(&without, &content), "101".into()).is_err());
    Ok(())
}

#[test]
fn set_replace_remove_converge_with_one_undo_step_each_and_typing_never_inherits() -> Result {
    let p = SharedRichProfile::from_standard_configuration_json_v4(&config(true))?;
    let mut a = p.create(
        &source(&p, &json!([{"kind":"text","text":"漢字です","formats":[]}])),
        "101".into(),
    )?;
    let mut b = p.join_frame("room".into(), "202".into(), &a.update_frame()?)?;
    let original = runs(&a)?;
    a.apply(vec![set(0, 2, ruby("かんじ"), true)])?;
    assert_eq!(a.undo_count(), 1);
    sync(&mut a, &mut b)?;
    let annotated = json!([{"kind":"text","text":"漢字","formats":[ruby("かんじ")]},{"kind":"text","text":"です","formats":[]}]);
    assert_eq!(runs(&b)?, annotated);
    // Replace on the peer: the newer stamp wins on every character.
    b.apply(vec![set(0, 2, ruby("カンジ"), true)])?;
    sync(&mut a, &mut b)?;
    assert_eq!(runs(&a)?[0]["formats"], json!([ruby("カンジ")]));
    // Typing at the end of the base (and inside it) is plain text, on both peers.
    a.set_selection(Some(&caret(2)))?;
    a.insert_plain_text("X")?;
    a.set_selection(Some(&caret(1)))?;
    a.insert_plain_text("Y")?;
    sync(&mut a, &mut b)?;
    assert_eq!(
        runs(&b)?,
        json!([
            {"kind":"text","text":"漢","formats":[ruby("カンジ")]},
            {"kind":"text","text":"Y","formats":[]},
            {"kind":"text","text":"字","formats":[ruby("カンジ")]},
            {"kind":"text","text":"Xです","formats":[]}
        ])
    );
    while a.undo()? {}
    while b.undo()? {}
    sync(&mut a, &mut b)?;
    assert_eq!(runs(&a)?, original);
    // Remove (enabled: false) in one group; a checkpoint replays the history exactly.
    a.apply(vec![set(0, 2, ruby("かんじ"), true)])?;
    a.apply(vec![set(0, 2, ruby("x"), false)])?;
    assert_eq!(runs(&a)?, original);
    let mut restored = p.restore("room", &a.checkpoint()?)?;
    assert_eq!(restored.document_json(), a.document_json());
    assert!(restored.undo()?);
    assert_eq!(runs(&restored)?, annotated);
    assert!(restored.undo()?);
    assert_eq!(runs(&restored)?, original);
    Ok(())
}

#[test]
fn an_over_bound_reading_is_refused_atomically() -> Result {
    let p = SharedRichProfile::from_standard_configuration_json_v4(&config(true))?;
    let mut a =
        p.create(&source(&p, &json!([{"kind":"text","text":"漢字","formats":[]}])), "101".into())?;
    let before = a.document_json().to_owned();
    assert!(
        a.apply(vec![
            Command::InsertText(InsertText { block: "p".into(), offset: 0, text: "a".into() }),
            set(0, 2, ruby(&"x".repeat(257)), true)
        ])
        .is_err()
    );
    assert_eq!(a.document_json(), before);
    assert_eq!(a.undo_count(), 0);
    Ok(())
}
