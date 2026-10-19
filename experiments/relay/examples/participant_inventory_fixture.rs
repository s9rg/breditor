//! Private native fixture generation for independent SDK recovery-prefix qualification.
#[path = "participant_inventory_fixture/capture.rs"]
mod capture;
#[path = "participant_inventory_fixture/clients.rs"]
mod clients;
#[path = "participant_inventory_fixture/source.rs"]
mod source;
#[path = "participant_inventory_fixture/storage.rs"]
mod storage;
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;

#[tokio::main(worker_threads = 2)]
async fn main() -> Result {
    let args: Vec<_> = std::env::args_os().skip(1).collect();
    let [parent] = args.as_slice() else {
        return Err("expected existing private fixture output parent".into());
    };
    let parent = std::fs::canonicalize(parent)?;
    if !parent.is_dir() {
        return Err("fixture parent is not a directory".into());
    }
    let mut fixtures = Vec::new();
    for (language, standard) in [(1, false), (2, false), (2, true), (3, false), (3, true)] {
        for atomic in [false, true] {
            let spec = source::Spec { language, standard, atomic };
            fixtures.push(Box::pin(capture::generate(&parent, spec)).await?);
        }
    }
    println!(
        "{}",
        serde_json::json!({"format":"breditor/native-participant-inventory-fixtures","formatVersion":1,"cases":fixtures})
    );
    Ok(())
}
