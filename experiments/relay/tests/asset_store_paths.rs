//! Each working-directory/alias mutation runs in its own process, not the parallel test harness.
use breditor_collab_relay::assets::{AssetStore, asset_id, prepare_asset};
use image::{DynamicImage, ImageFormat};
use std::{
    fs,
    io::Cursor,
    path::{Path, PathBuf},
    process::Command,
};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
const CHILD_ROOT: &str = "BREDITOR_ASSET_PATH_CHILD_ROOT";

struct Directory(PathBuf);
impl Drop for Directory {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}
fn raster(format: ImageFormat, width: u32, height: u32) -> Result<Vec<u8>> {
    let mut bytes = Cursor::new(Vec::new());
    DynamicImage::new_rgb8(width, height).write_to(&mut bytes, format)?;
    Ok(bytes.into_inner())
}
fn probe(kind: &str, root: &Path) -> Result {
    let original = root.join("original");
    let foreign = root.join("foreign");
    fs::create_dir(&original)?;
    fs::create_dir(&foreign)?;
    std::env::set_current_dir(&original)?;
    let source_path = if kind == "cwd" {
        PathBuf::from("assets")
    } else {
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(&original, root.join("alias"))?;
            root.join("alias/assets")
        }
        #[cfg(not(unix))]
        {
            return Err("unsupported alias fixture".into());
        }
    };
    let mut source = AssetStore::open(&source_path, &asset_id(b"original-room"))?;
    let original_bytes = raster(ImageFormat::Png, 2, 3)?;
    let original_asset = asset_id(&original_bytes);
    source.put(prepare_asset(&original_asset, "image/png", original_bytes.clone())?)?;
    let other = AssetStore::open(&foreign.join("assets"), &asset_id(b"foreign-room"))?;
    if kind == "cwd" {
        std::env::set_current_dir(&foreign)?;
    } else {
        #[cfg(unix)]
        {
            fs::remove_file(root.join("alias"))?;
            std::os::unix::fs::symlink(&foreign, root.join("alias"))?;
        }
    }
    let new_bytes = raster(ImageFormat::Jpeg, 3, 2)?;
    let new_asset = asset_id(&new_bytes);
    source.put(prepare_asset(&new_asset, "image/jpeg", new_bytes)?)?;
    let filename = format!("{}.asset", new_asset.strip_prefix("sha256:").ok_or("asset")?);
    let original_has = original.join("assets").join(&filename).exists();
    let foreign_has = foreign.join("assets").join(&filename).exists();
    println!(
        "{}",
        serde_json::json!({"case":kind,"originalHasNewAsset":original_has,
        "foreignHasNewAsset":foreign_has,"originalLogicalCount":source.count(),
        "foreignLogicalCount":other.count()})
    );
    assert!(original_has, "A retained asset owner must keep writing to its original directory");
    assert!(!foreign_has, "Changing a path alias must not publish into another room's asset store");
    assert_eq!(source.get(&original_asset)?.ok_or("retained original")?.bytes, original_bytes);
    assert_eq!(other.count(), 0);
    Ok(())
}
fn isolated(kind: &str, test: &str) -> Result {
    if let Some(root) = std::env::var_os(CHILD_ROOT) {
        return probe(kind, &PathBuf::from(root));
    }
    let nonce = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)?.as_nanos();
    let directory = Directory(
        std::env::temp_dir()
            .join(format!("breditor-assets-path-{kind}-{}-{nonce}", std::process::id())),
    );
    fs::create_dir(&directory.0)?;
    let output = Command::new(std::env::current_exe()?)
        .args(["--exact", test, "--nocapture"])
        .env(CHILD_ROOT, &directory.0)
        .current_dir(&directory.0)
        .output()?;
    assert!(
        output.status.success(),
        "isolated {kind} probe failed:\n{}\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    Ok(())
}
#[test]
fn relative_roots_remain_bound_after_process_working_directory_changes() -> Result {
    isolated("cwd", "relative_roots_remain_bound_after_process_working_directory_changes")
}
#[cfg(unix)]
#[test]
fn an_open_asset_owner_does_not_follow_a_retargeted_parent_symlink() -> Result {
    isolated("alias", "an_open_asset_owner_does_not_follow_a_retargeted_parent_symlink")
}
