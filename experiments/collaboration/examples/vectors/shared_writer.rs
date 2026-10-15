//! Independent native single-writer groups, lineage and staged relay outcomes.
use breditor_collab_feasibility::rich_replica::{
    Command, RichReplica, SharedRichProfile, WriterGroupPreparation,
    actions::{InsertText, ResizeColumn, ResizeImage, SetHeader, SetImageAlt},
    selection::Selection,
};
use serde_json::{Value, json};
type Result<T> = std::result::Result<T, Box<dyn std::error::Error>>;
const A: &str = "9007199254740993";
const B: &str = "9007199254740995";
fn groups(a: &RichReplica) -> Result<Vec<String>> {
    let value: Value = serde_json::from_str(&a.writer_groups_guarded(&a.observe()?, "0")?)?;
    Ok(value["groups"]
        .as_array()
        .ok_or("groups")?
        .iter()
        .map(|v| v.as_str().map(str::to_owned).ok_or("group"))
        .collect::<std::result::Result<_, _>>()?)
}
fn submit(
    server: &mut RichReplica,
    profile: &SharedRichProfile,
    writer: &str,
    frame: &str,
    commit: bool,
) -> Result<Value> {
    let before = server.checkpoint()?;
    let result = match server.prepare_writer_group(writer, frame) {
        Ok(WriterGroupPreparation::Prepared(p)) => {
            let receipt = p.receipt().clone();
            let document = p.document_json().to_owned();
            if server.checkpoint()? != before {
                return Err("staging published".into());
            }
            if commit {
                server.commit_writer_group(*p)?;
            }
            json!({"kind":"prepared","receipt":receipt,"document":document,"committed":commit})
        }
        Ok(WriterGroupPreparation::Duplicate(receipt)) => {
            json!({"kind":"duplicate","receipt":receipt})
        }
        Ok(WriterGroupPreparation::Pending { writer, missing }) => {
            json!({"kind":"pending","writer":writer,"missing":missing})
        }
        Err(error) => json!({"kind":"rejected","error":error.to_string()}),
    };
    let checkpoint = server.checkpoint()?;
    *server = profile.restore(server.document_id(), &checkpoint)?;
    Ok(
        json!({"result":result,"document":server.document_json(),"clock":server.writer_clock(writer)?}),
    )
}
pub fn generate(input: &str) -> Result<Value> {
    let raw: Value = serde_json::from_str(input)?;
    let configuration=json!({"format":"breditor/shared-rich-profile","formatVersion":1,"schema":raw["schema"],"extensions":[]}).to_string();
    let profile = SharedRichProfile::from_configuration_json(&configuration)?;
    let mut server = profile.create(input, "1".into())?;
    let seed = server.update_frame()?;
    let mut a = profile.join_frame("room".into(), A.into(), &seed)?;
    let mut b = profile.join_frame("room".into(), B.into(), &seed)?;
    let initial_a = a.checkpoint()?;
    let initial_b = b.checkpoint()?;
    a.apply(vec![
        Command::InsertText(InsertText { block: "p".into(), offset: 0, text: "Group 🙂".into() }),
        Command::ResizeColumn(ResizeColumn {
            block: "table-block".into(),
            column: "c".into(),
            width: 320,
        }),
        Command::SetHeader(SetHeader { cells: vec!["cell".into()], header: true }),
    ])?;
    b.apply(vec![Command::InsertText(InsertText {
        block: "caption".into(),
        offset: 0,
        text: "Peer ".into(),
    })])?;
    a.receive_frame(&b.update_frame()?)?;
    a.apply(vec![
        Command::SetImageAlt(SetImageAlt {
            block: "image-block".into(),
            text: "Grouped".into(),
            decorative: false,
        }),
        Command::ResizeImage(ResizeImage { block: "image-block".into(), size: Some([320, 180]) }),
    ])?;
    a.undo()?;
    a.redo()?;
    a.set_selection(Some(&Selection::Node { block: "image-block".into() }))?;
    let aa = groups(&a)?;
    let bb = groups(&b)?;
    let mut steps = Vec::new();
    for (writer, group, commit) in [
        (A, &aa[0], false),
        (A, &aa[1], true),
        (A, &aa[0], true),
        (A, &aa[1], true),
        (B, &bb[0], true),
        (A, &aa[1], true),
        (A, &aa[2], true),
        (A, &aa[3], true),
        (A, &aa[0], true),
        (A, &bb[0], true),
        (A, &aa[1], true),
    ] {
        steps.push(submit(&mut server, &profile, writer, group, commit)?);
    }
    if server.document_json() != a.document_json() {
        return Err("native relay/client divergence".into());
    }
    Ok(
        json!({"configuration":configuration,"input":input,"seed":seed,"initialA":initial_a,"initialB":initial_b,
        "groupsA":aa,"groupsB":bb,"clockA":a.writer_clock(A)?,"clockB":b.writer_clock(B)?,"steps":steps,"document":server.document_json()}),
    )
}
