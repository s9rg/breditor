//! Mixed structural coverage fixture; AST order deliberately differs from lexical ID order.
use serde_json::{Value, json};
pub(crate) fn element(kind: &str, id: &str, children: Vec<Value>) -> Value {
    let mut value = json!({"kind":"element","type":format!("breditor/{kind}"),"entityId":null,"properties":{"breditor/block-id":id},"children":[]});
    value["children"] = Value::Array(children);
    value
}
pub(crate) fn paragraph(id: &str, text: &str) -> Value {
    element(
        "paragraph",
        id,
        if text.is_empty() {
            vec![]
        } else {
            vec![json!({"kind":"text","text":text,"formats":[]})]
        },
    )
}
pub(crate) fn root() -> Value {
    let mut image = element("image", "image", vec![paragraph("caption", "xy🙂")]);
    image["properties"] = json!({"breditor/block-id":"image","breditor/image-id":"img","breditor/asset-id":"asset","breditor/asset-generation":"gen","breditor/decorative":false,"breditor/alt-text":"Diagram"});
    let rows = (0..3)
        .map(|r| {
            let cells = (0..4)
                .map(|c| {
                    let mut children = vec![paragraph(&format!("p-{r}-{c}"), "a🙂b")];
                    if (r, c) == (2, 1) {
                        children.push(image.clone());
                    }
                    let mut cell = element("table-cell", &format!("cell-{r}-{c}"), children);
                    cell["properties"]["breditor/column-id"] = json!(format!("c{c}"));
                    cell["properties"]["breditor/header"] = json!(r == 0);
                    cell
                })
                .collect();
            let mut row = element("table-row", &format!("row-{r}"), cells);
            row["properties"]["breditor/row-id"] = json!(format!("r{r}"));
            row
        })
        .collect();
    let mut table = element("table", "table", rows);
    table["properties"] = json!({"breditor/block-id":"table","breditor/table-id":"t","breditor/columns":(0..4).map(|c|json!({"id":format!("c{c}"),"width":100})).collect::<Vec<_>>(),
        "breditor/merges":[{"id":"m","lamport":"1","writer":"1","counter":"1","rows":["r0","r1","r2"],"columns":["c0","c1","c2","c3"],"first-row":"r0","last-row":"r1","first-column":"c0","last-column":"c1"}],"breditor/retracted-merges":[]});
    let mut hidden = table.clone();
    hidden["properties"]["breditor/block-id"] = json!("hidden");
    hidden["properties"]["breditor/table-id"] = json!("hidden-t");
    hidden["properties"]["breditor/merges"] = json!([]);
    hidden["children"] = json!([]);
    let quote =
        element("blockquote", "quote", vec![paragraph("q1", "Quote"), paragraph("q2", "Tail")]);
    let nested = element(
        "bullet-list",
        "nested",
        vec![element("list-item", "nested-item", vec![paragraph("nested-text", "Nested")])],
    );
    let list = element(
        "bullet-list",
        "list",
        vec![element("list-item", "item", vec![paragraph("head", "Head"), nested])],
    );
    let mut task = element("task-item", "task", vec![paragraph("task-head", "Task")]);
    task["properties"]["breditor/checked"] = json!(true);
    let tasks = element("task-list", "tasks", vec![task]);
    let code = element(
        "code-block",
        "code",
        vec![json!({"kind":"text","text":"plain\ncode","formats":[]})],
    );
    let mut root = element(
        "document",
        "unused",
        vec![
            element("horizontal-rule", "lead", vec![]),
            paragraph("z-intro", "a🙂b"),
            table,
            quote,
            list,
            tasks,
            paragraph("empty", ""),
            code,
            element("horizontal-rule", "tail", vec![]),
            hidden,
        ],
    );
    root["properties"] = json!({"breditor/document-id":"room"});
    root
}
