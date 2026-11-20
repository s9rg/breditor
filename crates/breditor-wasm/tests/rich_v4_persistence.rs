//! Durable frozen rich V4 through the Wasm owner: a document using all eight slices is
//! saved in each local checkpoint family, restored with identical document, selection and
//! retained Undo/Redo, and refused by every other profile (older languages included).
#![cfg(feature = "experimental-rich-content")]
#[path = "../../breditor-core/tests/support/coverage_fixture.rs"]
#[allow(dead_code)]
mod fixture;
#[path = "../../breditor-core/tests/support/rich_v4_frozen.rs"]
mod frozen;
use breditor_wasm::{BreditorRichEditor, BreditorRichProfile, BreditorStringResult};
use frozen::FROZEN;
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;

/// The golden checkpoint the frozen runtime saves for this exact edit script.
const SAVED: &str =
    include_str!("../../breditor-core/tests/fixtures/rich-v4-frozen-checkpoint.json");

fn read(mut r: BreditorStringResult) -> Result<String> {
    r.take_value().ok_or("read".into())
}
fn bootstrap(format: u32, name: &str, version: u32) -> String {
    json!({"format":"breditor/profile-bootstrap","formatVersion":format,"schema":{"name":name,"version":version},"extensions":[]}).to_string()
}
/// The SDK's stock V4 profile (`profileBootstrapJsonV4`).
fn standard_v4() -> Result<BreditorRichProfile> {
    BreditorRichProfile::from_standard_bootstrap_json_v4(&bootstrap(
        9,
        "breditor-editor/standard",
        4,
    ))
    .take_profile()
    .ok_or("profile".into())
}
fn descriptor(p: &BreditorRichProfile) -> Result<Value> {
    Ok(serde_json::from_str(&read(p.descriptor_json())?)?)
}
fn text(value: &str) -> Value {
    json!({"kind":"text","text":value,"formats":[]})
}
fn root() -> Value {
    let link = json!({"kind":"text","text":"intro","formats":[{"type":"breditor-inline/link","properties":{"breditor-inline/href":"#intro","breditor-inline/new-window":false}}]});
    let item = |id: &str| {
        fixture::element("list-item", id, vec![fixture::paragraph(&format!("{id}-text"), id)])
    };
    let mut list = fixture::element("ordered-list", "list", vec![item("a"), item("b")]);
    list["properties"]["breditor/start"] = json!(1);
    let mut image = fixture::element("image", "fig", vec![fixture::paragraph("cap", "Chart")]);
    image["properties"] = json!({"breditor/block-id":"fig","breditor/image-id":"img","breditor/asset-id":"asset","breditor/asset-generation":"gen","breditor/decorative":false,"breditor/alt-text":"Chart"});
    let mut cell = fixture::element("table-cell", "cell", vec![fixture::paragraph("c", "Cell")]);
    cell["properties"]["breditor/column-id"] = json!("k");
    cell["properties"]["breditor/header"] = json!(false);
    let mut row = fixture::element("table-row", "row", vec![cell]);
    row["properties"]["breditor/row-id"] = json!("r");
    let mut table = fixture::element("table", "table", vec![row]);
    table["properties"] = json!({"breditor/block-id":"table","breditor/table-id":"t","breditor/columns":[{"id":"k","width":160}],"breditor/merges":[],"breditor/retracted-merges":[]});
    let mut root = fixture::element(
        "document",
        "unused",
        vec![
            fixture::paragraph("h", "Introduction"),
            fixture::element("paragraph", "p", vec![text("Hi @an, see "), link]),
            fixture::paragraph("lang", "Hello world"),
            list,
            image,
            table,
            fixture::paragraph("s1", "Section one"),
            fixture::paragraph("s2", "Section two"),
            fixture::paragraph("q", "Tail"),
        ],
    );
    root["properties"] = json!({"breditor/document-id":"room"});
    root
}
fn owner(p: &BreditorRichProfile) -> Result<BreditorRichEditor> {
    let d = descriptor(p)?;
    p.create_editor(&json!({"format":"breditor/document","formatVersion":2,"schema":d["schema"],"schemaFingerprint":d["schemaFingerprint"],"root":root()}).to_string(), "100").take_editor().ok_or("owner".into())
}
fn run(a: &mut BreditorRichEditor, c: &Value, expected: &str) -> Result {
    let status = a.execute(&a.observe(), &c.to_string()).status();
    if status == expected { Ok(()) } else { Err(format!("{c}: {status}").into()) }
}
fn command(kind: &str, data: Value) -> Value {
    let mut value = json!({"kind":kind});
    value["data"] = data;
    value
}
fn select(block: &str, start: u32, end: u32) -> Value {
    let point = |offset: u32| json!({"block":block,"offset":offset.to_string(),"affinity":"after"});
    json!({"kind":"setSelection","selection":{"kind":"text","anchor":point(start),"focus":point(end)}})
}
/// One retained history step per slice (the caption text adds a ninth).
fn edit_every_slice(a: &mut BreditorRichEditor) -> Result {
    run(a, &command("setBookmark", json!({"block":"h","name":"intro"})), "content")?;
    run(
        a,
        &command(
            "insertMention",
            json!({"selection":{"kind":"text","anchor":{"block":"p","offset":"3","affinity":"after"},"focus":{"block":"p","offset":"6","affinity":"after"}},"mention":{"kind":"user","id":"u-1","label":"Ann"}}),
        ),
        "content",
    )?;
    run(a, &select("lang", 6, 11), "selection")?;
    run(a, &command("setTextLanguage", json!({"language":"fr-CA"})), "content")?;
    run(
        a,
        &command(
            "setListNumbering",
            json!({"list":"list","style":"lower-roman","reversed":true,"start":3}),
        ),
        "content",
    )?;
    run(
        a,
        &command("setImageLink", json!({"image":"img","href":"https://example.com/chart"})),
        "content",
    )?;
    run(a, &command("addTableCaption", json!({"table":"t","caption":"tc"})), "content")?;
    run(a, &json!({"kind":"insertPlainText","text":"Legend"}), "content")?;
    run(a, &select("s2", 1, 1), "selection")?;
    run(
        a,
        &command(
            "wrapDetails",
            json!({"first":"s1","last":"s2","wrapper":"d","summary":"sm","open":true}),
        ),
        "content",
    )?;
    run(
        a,
        &command(
            "insertPageBreak",
            json!({"position":{"parent":{"kind":"document"},"before":"q"},"block":"pb"}),
        ),
        "content",
    )?;
    run(a, &select("q", 1, 3), "selection")
}
fn view(a: &BreditorRichEditor, document: bool) -> Result<Value> {
    let o = a.observe();
    Ok(serde_json::from_str(&read(if document { o.document_view_json() } else { o.view_json() })?)?)
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Family {
    Explicit,
    Typing,
    Document,
    DocumentTyping,
}
impl Family {
    const ALL: [Self; 4] = [Self::Explicit, Self::Typing, Self::Document, Self::DocumentTyping];
    const fn typing(self) -> bool {
        matches!(self, Self::Typing | Self::DocumentTyping)
    }
    const fn document(self) -> bool {
        matches!(self, Self::Document | Self::DocumentTyping)
    }
    fn save(self, a: &BreditorRichEditor) -> Result<String> {
        read(if self.document() { a.document_checkpoint_json() } else { a.checkpoint_json() })
    }
    fn restore(self, p: &BreditorRichProfile, saved: &str) -> Option<BreditorRichEditor> {
        match self {
            Self::Explicit => p.restore_editor(saved),
            Self::Typing => p.restore_typing_editor(saved),
            Self::Document => p.restore_document_editor(saved),
            Self::DocumentTyping => p.restore_document_typing_editor(saved),
        }
        .take_editor()
    }
}
fn edited(p: &BreditorRichProfile, family: Family) -> Result<BreditorRichEditor> {
    let mut a = owner(p)?;
    if family.typing() {
        read(a.enable_typing_history(&a.observe()))?;
    }
    edit_every_slice(&mut a)?;
    Ok(a)
}
fn depth(a: &BreditorRichEditor) -> Result<u64> {
    view(a, false)?["undoDepth"].as_u64().ok_or("depth".into())
}

#[test]
fn stock_v4_profile_binds_the_frozen_fingerprint() -> Result {
    let d = descriptor(&standard_v4()?)?;
    assert_eq!(d["schemaFingerprint"], frozen::V4_STANDARD_FINGERPRINT, "{FROZEN}");
    assert_eq!(d["richLanguageVersion"], frozen::V4_RULE_REVISION, "{FROZEN}");
    Ok(())
}

#[test]
fn saved_checkpoint_is_the_frozen_golden_record() -> Result {
    let p = standard_v4()?;
    let a = edited(&p, Family::Explicit)?;
    assert_eq!(Family::Explicit.save(&a)?, SAVED.trim_end(), "{FROZEN}");
    let b = p.restore_editor(SAVED.trim_end()).take_editor().ok_or(FROZEN)?;
    assert_eq!(read(b.checkpoint_json())?, SAVED.trim_end());
    Ok(())
}

#[test]
fn every_family_restores_document_selection_and_history_exactly() -> Result {
    let p = standard_v4()?;
    for family in Family::ALL {
        let mut a = edited(&p, family)?;
        let saved = family.save(&a)?;
        let mut b = family.restore(&p, &saved).ok_or(format!("{family:?} restore"))?;
        assert_eq!(family.save(&b)?, saved, "{family:?}");
        assert_eq!(read(b.observe().document_json())?, read(a.observe().document_json())?);
        assert_eq!(
            view(&b, family.document())?["selection"],
            view(&a, family.document())?["selection"]
        );
        let steps = depth(&a)?;
        assert_eq!(depth(&b)?, steps);
        assert!(steps >= 8, "{family:?} retained {steps} steps");
        let mut states = vec![read(a.observe().document_json())?];
        for _ in 0..steps {
            run(&mut a, &json!({"kind":"undo"}), "undo")?;
            run(&mut b, &json!({"kind":"undo"}), "undo")?;
            assert_eq!(family.save(&a)?, family.save(&b)?, "{family:?} undo");
            states.push(read(b.observe().document_json())?);
        }
        let base: Value = serde_json::from_str(&read(b.observe().document_json())?)?;
        assert_eq!(base["root"], serde_json::from_str::<Value>(&root().to_string())?);
        for state in states.iter().rev().skip(1) {
            run(&mut a, &json!({"kind":"redo"}), "redo")?;
            run(&mut b, &json!({"kind":"redo"}), "redo")?;
            assert_eq!(family.save(&a)?, family.save(&b)?, "{family:?} redo");
            assert_eq!(&read(b.observe().document_json())?, state);
        }
        assert_eq!(family.save(&b)?, family.save(&a)?);
    }
    Ok(())
}

/// Every profile that must refuse a stock V4 record.
fn others() -> Result<Vec<BreditorRichProfile>> {
    let s = "breditor-editor/standard";
    [
        // Older languages under the stock selector and under V4's own selector.
        BreditorRichProfile::from_standard_layout_bootstrap_json_v3(&bootstrap(8, s, 3)),
        BreditorRichProfile::from_standard_layout_bootstrap_json_v3(&bootstrap(8, s, 4)),
        BreditorRichProfile::from_standard_structural_bootstrap_json_v2(&bootstrap(7, s, 4)),
        BreditorRichProfile::from_standard_bootstrap_json_v1(&bootstrap(6, s, 4)),
        // V4 with another selector or without the standard inline preset.
        BreditorRichProfile::from_standard_bootstrap_json_v4(&bootstrap(9, "example/layout", 1)),
        BreditorRichProfile::from_bootstrap_json_v4(&bootstrap(9, s, 4)),
    ]
    .into_iter()
    .map(|mut result| result.take_profile().ok_or_else(|| "other profile".into()))
    .collect()
}

#[test]
fn every_other_profile_and_family_refuses_a_saved_v4_checkpoint() -> Result {
    let p = standard_v4()?;
    let others = others()?;
    for family in Family::ALL {
        let saved = family.save(&edited(&p, family)?)?;
        for other in &others {
            assert!(family.restore(other, &saved).is_none(), "{family:?}");
        }
        // Families never cross: each saved record restores only through its own factory.
        for wrong in Family::ALL {
            if wrong != family {
                assert!(wrong.restore(&p, &saved).is_none(), "{family:?} as {wrong:?}");
            }
        }
        let forged = saved.replace(frozen::V4_STANDARD_FINGERPRINT, frozen::V3_LAYOUT_FINGERPRINT);
        assert_ne!(forged, saved);
        assert!(family.restore(&p, &forged).is_none());
    }
    Ok(())
}
