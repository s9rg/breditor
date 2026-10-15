//! Bounded native admission test bridge, not a listening relay or an account authenticator.
use breditor_collab_feasibility::rich_replica::{SharedRichProfile, WriterGroupPreparation};
use serde::Deserialize;
use serde_json::{Value, json};
use std::io::{BufRead, BufReader, Read};
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Input {
    configuration: String,
    document: String,
    server_writer: String,
    steps: Vec<Step>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Step {
    writer: String,
    frame: String,
    commit: bool,
}
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut input = String::new();
    BufReader::new(std::io::stdin().lock().take(16 * 1024 * 1024 + 1)).read_line(&mut input)?;
    if input.len() > 16 * 1024 * 1024 || !input.ends_with('\n') {
        return Err("bounded newline-terminated relay test request required".into());
    }
    let input: Input = serde_json::from_str(&input)?;
    if input.steps.len() > 64 {
        return Err("relay test step limit".into());
    }
    let profile = SharedRichProfile::from_configuration_json(&input.configuration)?;
    let mut server = profile.create(&input.document, input.server_writer)?;
    let mut steps = Vec::new();
    for step in input.steps {
        let before = server.checkpoint()?;
        let result = match server.prepare_writer_group(&step.writer, &step.frame) {
            Ok(WriterGroupPreparation::Prepared(p)) => {
                let receipt = p.receipt().clone();
                let document = p.document_json().to_owned();
                let candidate = p.checkpoint()?;
                if server.checkpoint()? != before {
                    return Err("preparation mutated live room".into());
                }
                if step.commit {
                    server.commit_writer_group(*p)?;
                    if server.checkpoint()? != candidate {
                        return Err("commit differs from prepared checkpoint".into());
                    }
                }
                json!({"kind":"prepared","receipt":receipt,"document":document,"committed":step.commit})
            }
            Ok(WriterGroupPreparation::Duplicate(receipt)) => {
                json!({"kind":"duplicate","receipt":receipt})
            }
            Ok(WriterGroupPreparation::Pending { writer, missing }) => {
                json!({"kind":"pending","writer":writer,"missing":missing})
            }
            Err(error) => json!({"kind":"rejected","error":error.to_string()}),
        };
        if (result["kind"] != "prepared" || !step.commit) && server.checkpoint()? != before {
            return Err("uncommitted admission changed room".into());
        }
        let saved = server.checkpoint()?;
        server = profile.restore(server.document_id(), &saved)?;
        if server.checkpoint()? != saved {
            return Err("relay recovery differs".into());
        }
        steps.push(json!({"result":result,"document":server.document_json(),"clock":server.writer_clock(&step.writer)?}));
    }
    let final_state: Value =
        json!({"steps":steps,"document":server.document_json(),"frame":server.update_frame()?});
    println!("{final_state}");
    Ok(())
}
