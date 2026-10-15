//! Combined copy, fresh table/image/grid paste, remote editing and future exact history vector.
use breditor_collab_feasibility::rich_replica::{
    Command, PasteTarget, RichReplica,
    actions::{ClearTableCells, InsertColumn, InsertText, MergeCells, PasteTableCells, PastedCell},
    selection::{CellTarget, Selection},
};
use breditor_core::{
    codec::DocumentJsonCodecV2,
    extension::{ExtensionLimits, ExtensionSet},
    identity::QualifiedName,
    rich_content::{
        CausalStamp, ChangeId, ReplicaId, RichClipboardError, RichClipboardIdAllocator,
        RichClipboardIdentityKind,
    },
    schema::{CompiledSchema, SchemaId, SchemaVersion},
};
use serde_json::{Value, json};
type Result<T> = std::result::Result<T, Box<dyn std::error::Error>>;
#[derive(Default)]
struct Ids(usize);
impl RichClipboardIdAllocator for Ids {
    fn next(
        &mut self,
        kind: RichClipboardIdentityKind,
    ) -> std::result::Result<String, RichClipboardError> {
        self.0 += 1;
        Ok(format!("native-clipboard-{kind:?}-{}", self.0))
    }
    fn merge_stamp(&mut self) -> std::result::Result<CausalStamp, RichClipboardError> {
        Ok(CausalStamp::new(
            999,
            ChangeId::new(
                ReplicaId::try_new(333).map_err(|_| RichClipboardError::Allocation)?,
                123,
            ),
        ))
    }
}
fn snapshot(a: &RichReplica) -> Result<Value> {
    Ok(json!({"view":a.view_json()?,"checkpoint":a.checkpoint()?,"bytes":a.updates()?}))
}
fn copy(a: &mut RichReplica, selection: &Selection) -> Result<String> {
    a.set_selection(Some(selection))?;
    Ok(a.copy_clipboard_guarded(&a.observe()?)?.ok_or("copy")?.rich_json)
}
fn paste(a: &mut RichReplica, input: &str, target: PasteTarget, ids: &mut Ids) -> Result<()> {
    let o = a.observe()?;
    a.paste_clipboard_guarded(&o, input, target, ids)?;
    Ok(())
}
pub fn generate(input: &str) -> Result<Value> {
    let value: Value = serde_json::from_str(input)?;
    let codec = DocumentJsonCodecV2::new(CompiledSchema::try_compile_rich_content_profile(
        SchemaId::new(
            QualifiedName::try_new(value["schema"]["name"].as_str().ok_or("schema")?)?,
            SchemaVersion::try_new(1)?,
        ),
        &ExtensionSet::try_new(vec![], ExtensionLimits::default())?,
    )?);
    let mut a = RichReplica::new(codec.clone(), input, "9007199254740993".into())?;
    a.apply(vec![Command::InsertColumn(InsertColumn {
        block: "table-block".into(),
        column: "copy-column".into(),
        width: 180,
        before: None,
    })])?;
    let raw: Value = serde_json::from_str(a.document_json())?;
    let second =
        raw["root"]["children"][0]["children"][0]["children"][1]["properties"]["breditor/block-id"]
            .as_str()
            .ok_or("cell")?
            .to_owned();
    a.apply(vec![Command::PasteTableCells(PasteTableCells{anchor:second.clone(),focus:second.clone(),cells:vec![vec![PastedCell{body:vec![json!({"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{"breditor/block-id":"copy-right"},"children":[{"kind":"text","text":"Right🙂","formats":[]}]})],header:Some(true)}]],merges:vec![]})])?;
    a.apply(vec![Command::MergeCells(MergeCells {
        block: "table-block".into(),
        merge: "copy-source-merge".into(),
        anchor: "cell".into(),
        focus: second.clone(),
    })])?;
    let grid = Selection::Grid {
        anchor: CellTarget { table: "t".into(), row: "r".into(), column: "copy-column".into() },
        focus: CellTarget { table: "t".into(), row: "r".into(), column: "c".into() },
    };
    let fragment = copy(&mut a, &grid)?;
    let mut ids = Ids::default();
    paste(&mut a, &fragment, PasteTarget::Flow { parent: None, before: None }, &mut ids)?;
    let image = copy(&mut a, &Selection::Node { block: "image-block".into() })?;
    paste(&mut a, &image, PasteTarget::Flow { parent: None, before: None }, &mut ids)?;
    a.set_selection(Some(&grid))?;
    let mut b = RichReplica::join(codec, "room".into(), "9007199254740995".into(), a.updates()?)?;
    paste(&mut a, &fragment, PasteTarget::Grid, &mut ids)?;
    b.apply(vec![
        Command::InsertText(InsertText {
            block: "caption".into(),
            offset: 0,
            text: "Remote🙂".into(),
        }),
        Command::InsertText(InsertText { block: "copy-right".into(), offset: 0, text: "R".into() }),
    ])?;
    a.receive(b.updates()?)?;
    a.undo()?;
    let checkpoint = a.checkpoint()?;
    let current = snapshot(&a)?;
    a.redo()?;
    let redo = snapshot(&a)?;
    let clear = Command::ClearTableCells(ClearTableCells {
        anchor: second,
        focus: "cell".into(),
        empty: vec!["native-clear-left".into(), "native-clear-right".into()],
    });
    a.apply(vec![clear.clone()])?;
    let cleared = snapshot(&a)?;
    a.undo()?;
    let undo = snapshot(&a)?;
    a.redo()?;
    let repeated = snapshot(&a)?;
    Ok(
        json!({"checkpoint":checkpoint,"current":current,"redo":redo,"cleared":cleared,"undo":undo,"repeated":repeated,"clear":clear}),
    )
}
