//! Capture with an older native model 12, then verify exact recovery/future history in a newer one.
use breditor_collaboration::rich_replica::{Command, RichReplica, SharedRichProfile};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
const CONFIG: &str = r#"{"format":"breditor/shared-rich-profile","formatVersion":2,"schema":{"name":"example/native-v2-compatibility","version":2},"extensions":[]}"#;

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Step {
    action: Value,
    changed: bool,
    checkpoint: String,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Capture {
    format: String,
    version: u32,
    configuration: String,
    checkpoint: String,
    steps: Vec<Step>,
}
fn command(kind: &str, data: Value) -> Value {
    json!({"kind":kind,"data":data})
}
fn dispatch(owner: &mut RichReplica, commands: Vec<Value>) -> Result<bool> {
    Ok(owner.apply(serde_json::from_value::<Vec<Command>>(Value::Array(commands))?)?)
}
fn element(kind: &str, id: &str, children: Value) -> Value {
    json!({"kind":"element","type":kind,"entityId":null,"properties":{"breditor/block-id":id},"children":children})
}
fn prose(id: &str, text: &str) -> Value {
    element("breditor/paragraph", id, json!([{"kind":"text","text":text,"formats":[]}]))
}
fn seed(profile: &SharedRichProfile) -> String {
    let schema = profile.schema();
    let mut code =
        element("breditor/code-block", "code", json!([{"kind":"text","text":"a🙂b","formats":[]}]));
    code["properties"]["breditor/language"] = json!("rust");
    let mut task = element("breditor/task-item", "task", json!([prose("task-head", "Do it")]));
    task["properties"]["breditor/checked"] = json!(false);
    let quote = element("breditor/blockquote", "quote", json!([prose("quote-head", "Quote")]));
    let tasks = element("breditor/task-list", "tasks", json!([task]));
    json!({"format":"breditor/document","formatVersion":2,"schema":{"name":schema.id().name().as_str(),"version":schema.id().version().get()},"schemaFingerprint":schema.fingerprint().to_string(),"root":{"kind":"element","type":"breditor/document","entityId":null,"properties":{"breditor/document-id":"room"},"children":[prose("p","P🙂"),prose("q","Q"),code,quote,tasks]}}).to_string()
}
fn perform(owner: &mut RichReplica, action: &Value) -> Result<bool> {
    match action.as_str() {
        Some("undo") => Ok(owner.undo()?),
        Some("redo") => Ok(owner.redo()?),
        None => dispatch(owner, action.as_array().ok_or("command array")?.clone()),
        _ => Err("unknown history operation".into()),
    }
}
fn capture() -> Result<Capture> {
    let profile = SharedRichProfile::from_standard_configuration_json_v2(CONFIG)?;
    let mut a = profile.create(&seed(&profile), "101".into())?;
    let mut b = profile.join_frame("room".into(), "202".into(), &a.update_frame()?)?;
    dispatch(
        &mut a,
        vec![command(
            "wrap_list",
            json!({"first":"p","last":"q","container":"list","items":["item-p","item-q"],"style":{"kind":"bullet"}}),
        )],
    )?;
    dispatch(&mut a, vec![command("set_heading", json!({"block":"code","level":null}))])?;
    dispatch(
        &mut b,
        vec![
            command("insert_text", json!({"block":"p","offset":0,"text":"Remote "})),
            command("set_code_language", json!({"block":"code","language":"ruby"})),
            command("set_task_checked", json!({"block":"task","checked":true})),
        ],
    )?;
    let x = a.update_frame()?;
    let y = b.update_frame()?;
    a.receive_frame(&y)?;
    b.receive_frame(&x)?;
    assert_eq!(a.document_json(), b.document_json());
    dispatch(&mut a, vec![command("set_task_checked", json!({"block":"task","checked":false}))])?;
    let checkpoint = a.checkpoint()?;
    let mut actions = vec![
        json!("undo"),
        json!("undo"),
        json!("undo"),
        json!("redo"),
        json!("redo"),
        json!("redo"),
    ];
    actions.push(json!([command("unwrap_list", json!({"container":"list"}))]));
    actions.extend([json!("undo"), json!("redo")]);
    actions.push(json!([command(
        "set_code_block",
        json!({"block":"code","language":"python","format_policy":"reject_formatted"})
    )]));
    actions.extend([
        json!("undo"),
        json!("redo"),
        json!("undo"),
        json!("undo"),
        json!("redo"),
        json!("redo"),
    ]);
    let mut steps = vec![];
    for action in actions {
        let changed = perform(&mut a, &action)?;
        steps.push(Step { action, changed, checkpoint: a.checkpoint()? });
    }
    Ok(Capture {
        format: "breditor/native-structural-v2-compatibility".into(),
        version: 1,
        configuration: CONFIG.into(),
        checkpoint,
        steps,
    })
}
fn main() -> Result {
    let args: Vec<_> = std::env::args().skip(1).collect();
    if args.len() != 2 {
        return Err("Usage: structural-v2-compat capture|verify JSON_FILE".into());
    }
    match args[0].as_str() {
        "capture" => {
            let capture = capture()?;
            std::fs::write(&args[1], serde_json::to_vec(&capture)?)?;
            println!(
                "{}",
                json!({"captured":true,"modelVersion":12,"journalVersion":13,"futureStates":capture.steps.len()})
            );
        }
        "verify" => {
            let capture: Capture = serde_json::from_slice(&std::fs::read(&args[1])?)?;
            if capture.format != "breditor/native-structural-v2-compatibility"
                || capture.version != 1
            {
                return Err("capture format".into());
            }
            let profile =
                SharedRichProfile::from_standard_configuration_json_v2(&capture.configuration)?;
            let mut owner = profile.restore("room", &capture.checkpoint)?;
            assert_eq!(owner.checkpoint()?, capture.checkpoint);
            for (index, step) in capture.steps.iter().enumerate() {
                assert_eq!(
                    perform(&mut owner, &step.action)?,
                    step.changed,
                    "changed at step {index}"
                );
                assert_eq!(owner.checkpoint()?, step.checkpoint, "journal at step {index}");
            }
            println!(
                "{}",
                json!({"verified":true,"modelVersion":owner.model_version(),"journalVersion":owner.journal_version(),"futureStates":capture.steps.len()})
            );
        }
        _ => return Err("unknown compatibility mode".into()),
    }
    Ok(())
}
