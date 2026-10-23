//! Separate seven-author native fixture. Old two-author fixture contracts stay closed.
#[path = "complete_cohort_fixture/capture.rs"]
mod capture;
#[path = "complete_cohort_fixture/clients.rs"]
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
        return Err("expected existing private seven-author fixture parent".into());
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
        serde_json::json!({"format":"breditor/native-complete-cohort-fixtures","formatVersion":1,
            "registeredWriters":7,"registeredReviewActors":7,"protectedStreams":14,
            "archiveLimits":{"serverBytes":breditor_collab_relay::MAX_SERVER_LOG_GENERATION_ROOM_BACKUP_BYTES,"nativeBytes":breditor_collab_relay::MAX_SERVER_LOG_GENERATION_BACKUP_BYTES,"rasterBytes":breditor_collab_relay::assets::MAX_SERVER_ASSET_BACKUP_BYTES},"cases":cases})
    );
    Ok(())
}
