//! Optional mounted storage used only by the isolated qualification fixture.
use super::{Result, storage};
use std::path::Path;

pub(super) fn mount(room: &Path, lane: &str) -> Result<bool> {
    let Some(program) = std::env::var_os("BREDITOR_TEST_ARCHIVE_MOUNT") else {
        return Ok(false);
    };
    let target = room.join(".sealed-wal-volume");
    storage::directory(&target)?;
    if !std::process::Command::new(program)
        .arg(&target)
        .arg(lane)
        .stdout(std::process::Stdio::null())
        .status()?
        .success()
    {
        return Err("fixture archive volume was not mounted".into());
    }
    storage::directory(&target.join("archive"))?;
    Ok(true)
}

pub(super) fn restored_native_root(root: &Path) -> Result<std::path::PathBuf> {
    fn selected_child(root: &Path, file: &str) -> Result<std::path::PathBuf> {
        let value: serde_json::Value = serde_json::from_slice(&std::fs::read(root.join(file))?)?;
        let name = value["directory"].as_str().ok_or("fixture component directory absent")?;
        let path = Path::new(name);
        if path.components().count() != 1 || path.file_name().is_none() {
            return Err("invalid fixture component directory".into());
        }
        Ok(root.join(path))
    }
    selected_child(&selected_child(root, ".native.json")?, ".component.json")
}
