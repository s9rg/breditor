//! Shared semantic fixtures for native single-user and replicated atom contracts.
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
pub(crate) fn prose(id: &str, text: &str) -> Value {
    json!({"kind":"element","type":"breditor/paragraph","entityId":null,
        "properties":{"breditor/block-id":id},"children":if text.is_empty(){vec![]}
        else{vec![json!({"kind":"text","text":text,"formats":[]})]}})
}
pub(crate) fn fixture(
    kind: &str,
    parent: &str,
    sole: bool,
    hidden: bool,
) -> Result<(Value, &'static str)> {
    let original: Value = serde_json::from_str(include_str!("../fixtures/rich-local-root.json"))?;
    let table = original["children"][0].clone();
    let (atom, target) = match kind {
        "table" => (table.clone(), "table-block"),
        "image" => (table["children"][0]["children"][0]["children"][1].clone(), "image-block"),
        "rule" => (
            json!({"kind":"element","type":"breditor/horizontal-rule","entityId":null,
            "properties":{"breditor/block-id":"rule"},"children":[]}),
            "rule",
        ),
        _ => return Err("atom kind".into()),
    };
    let mut flow =
        if sole { vec![atom] } else { vec![prose("left", "a🙂b"), atom, prose("right", "End")] };
    if hidden {
        let mut node = table.clone();
        node["properties"]["breditor/block-id"] = json!("hidden");
        node["properties"]["breditor/table-id"] = json!("hidden-table");
        node["children"] = json!([]);
        flow = vec![flow.get(usize::from(!sole)).ok_or("atom")?.clone(), node];
    }
    let content = match parent {
        "root" => flow,
        "quote" => vec![
            prose("outer-before", "Outside"),
            json!({"kind":"element","type":"breditor/blockquote","entityId":null,
                "properties":{"breditor/block-id":"quote"},"children":flow}),
            prose("outer-after", "After"),
        ],
        "cell" => {
            let mut outer = table;
            outer["children"][0]["children"][0]["children"] = json!(flow);
            vec![prose("outer-before", "Outside"), outer, prose("outer-after", "After")]
        }
        "list" | "task" => {
            // These grammars require a prose head, even when the atom is trailing.
            flow.insert(0, prose("head", "Head"));
            let (list, item) = if parent == "task" {
                ("task-list", "task-item")
            } else {
                ("bullet-list", "list-item")
            };
            let mut properties = json!({"breditor/block-id":"item"});
            if parent == "task" {
                properties["breditor/checked"] = json!(true);
            }
            vec![json!({"kind":"element","type":format!("breditor/{list}"),"entityId":null,
                "properties":{"breditor/block-id":"list"},"children":[{
                    "kind":"element","type":format!("breditor/{item}"),"entityId":null,
                    "properties":properties,"children":flow}]})]
        }
        _ => return Err("flow parent".into()),
    };
    let mut root = original;
    root["children"] = json!(content);
    Ok((root, target))
}
pub(crate) fn count(v: &Value) -> usize {
    1 + v.get("children").and_then(Value::as_array).map_or(0, |a| a.iter().map(count).sum())
}
pub(crate) fn find<'a>(v: &'a Value, id: &str) -> Option<&'a Value> {
    if v.pointer("/properties/breditor~1block-id").and_then(Value::as_str) == Some(id) {
        return Some(v);
    }
    v.get("children")?.as_array()?.iter().find_map(|n| find(n, id))
}
