//! Independent configurable-profile journal and exact future Wasm history.
use breditor_collab_feasibility::{
    anchor::Affinity,
    rich_replica::{
        Command, RichReplica, SharedRichProfile,
        actions::{InsertText, ResizeColumn, SetImageAlt},
        selection::{Selection, TextPoint},
    },
};
use serde_json::{Value, json};
type Result<T> = std::result::Result<T, Box<dyn std::error::Error>>;
fn capture(a: &RichReplica) -> Result<Value> {
    Ok(json!({"view":a.view_json()?,"checkpoint":a.checkpoint()?,"bytes":a.updates()?}))
}
pub fn generate(input: &str) -> Result<Value> {
    let configuration = json!({"format":"breditor/shared-rich-profile","formatVersion":1,
    "schema":{"name":"example/application-rich","version":3},
    "limits":{"maxJsonBytes":524_288,"maxTextBytes":8192,"maxTotalTextBytes":65536},
    "extensions":[{"id":{"name":"example/product-formats","version":1},"dependencies":[],"conflicts":[],"formats":[
        {"kind":"example/link","revision":1,"properties":[{"name":"example/href","presence":"required","valueType":{"kind":"string","minimumUtf8Bytes":1,"maximumUtf8Bytes":2048}}]},
        {"kind":"example/review","revision":1,"properties":[{"name":"example/resolved","presence":"required","valueType":{"kind":"boolean"}},{"name":"example/priority","presence":"optional","valueType":{"kind":"integer","minimum":0,"maximum":9}}]}
    ]}]});
    let profile = SharedRichProfile::from_configuration_json(&configuration.to_string())?;
    let descriptor = profile.descriptor_json();
    let binding: Value = serde_json::from_str(&descriptor)?;
    let mut input: Value = serde_json::from_str(input)?;
    input["schema"] = binding["schema"].clone();
    input["schemaFingerprint"] = binding["schemaFingerprint"].clone();
    input["root"]["children"][0]["children"][0]["children"][0]["children"][0]["children"][0]["formats"] =
        json!([{"type":"example/link","properties":{"example/href":"https://example.test/docs"}}]);
    let input = input.to_string();
    let mut a = profile.create(&input, "9007199254740993".into())?;
    let mut b = profile.join_frame("room".into(), "9007199254740995".into(), &a.update_frame()?)?;
    let point = TextPoint { block: "p".into(), offset: 1, affinity: Affinity::After };
    a.set_selection(Some(&Selection::TextRange { anchor: point.clone(), focus: point }))?;
    a.set_pending_formats(Some(&[json!({"type":"example/review","properties":{"example/resolved":false,"example/priority":0}})]))?;
    a.apply(vec![
        Command::ResizeColumn(ResizeColumn {
            block: "table-block".into(),
            column: "c".into(),
            width: 320,
        }),
        Command::SetImageAlt(SetImageAlt {
            block: "image-block".into(),
            text: "Application image".into(),
            decorative: false,
        }),
    ])?;
    b.apply(vec![Command::InsertText(InsertText {
        block: "caption".into(),
        offset: 0,
        text: "Peer ".into(),
    })])?;
    let (x, y) = (a.update_frame()?, b.update_frame()?);
    a.receive_frame(&y)?;
    b.receive_frame(&x)?;
    let checkpoint = a.checkpoint()?;
    let current = capture(&a)?;
    a.undo()?;
    let undo = capture(&a)?;
    a.redo()?;
    let redo = capture(&a)?;
    a.insert_plain_text("!")?;
    let typed = capture(&a)?;
    a.undo()?;
    let undo_typed = capture(&a)?;
    a.redo()?;
    let redo_typed = capture(&a)?;
    Ok(
        json!({"configuration":configuration,"descriptor":descriptor,"input":input,"checkpoint":checkpoint,
        "current":current,"undo":undo,"redo":redo,"typed":typed,"undo_typed":undo_typed,"redo_typed":redo_typed}),
    )
}
