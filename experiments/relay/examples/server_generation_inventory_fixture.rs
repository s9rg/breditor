//! Private physical-generation native fixtures for the SDK and independent installed consumers.
#[path = "server_generation_inventory_fixture/capture.rs"]
mod capture;
#[path = "participant_inventory_fixture/clients.rs"]
mod clients;
#[path = "server_generation_inventory_fixture/source.rs"]
mod source;
#[path = "participant_inventory_fixture/storage.rs"]
mod storage;
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;

#[tokio::main(worker_threads = 2)]
async fn main() -> Result {
    let args: Vec<_> = std::env::args_os().skip(1).collect();
    let [parent] = args.as_slice() else {
        return Err("expected existing private physical fixture output parent".into());
    };
    let parent = std::fs::canonicalize(parent)?;
    if !parent.is_dir() {
        return Err("fixture parent is not a directory".into());
    }
    let mut cases = Vec::new();
    for (language, standard) in [(1, false), (2, false), (2, true), (3, false), (3, true)] {
        for atomic in [false, true] {
            cases.push(
                Box::pin(capture::generate(&parent, source::Spec { language, standard, atomic }))
                    .await?,
            );
        }
    }
    println!(
        "{}",
        serde_json::json!({"format":"breditor/native-server-generation-inventory-fixtures","formatVersion":1,"cases":cases})
    );
    Ok(())
}
