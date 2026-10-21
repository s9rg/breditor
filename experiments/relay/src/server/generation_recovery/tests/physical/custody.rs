//! Changed actual controls/files and unexpected work refuse; detached checks never repair them.
use super::{super::source::TestResult, fixture::PhysicalSource};
use crate::server::PhysicalServerRoomRecoveryCoverage;
use std::{collections::BTreeMap, fs, io::Write, os::unix::fs::OpenOptionsExt, path::Path};

fn snapshot(root: &Path) -> TestResult<BTreeMap<String, Vec<u8>>> {
    let mut output = BTreeMap::new();
    for entry in fs::read_dir(root)? {
        let entry = entry?;
        let name = entry.file_name().into_string().map_err(|_| "fixture file name")?;
        if entry.file_type()?.is_dir() {
            for (child, bytes) in snapshot(&entry.path())? {
                output.insert(format!("{name}/{child}"), bytes);
            }
        } else {
            output.insert(name, fs::read(entry.path())?);
        }
    }
    Ok(output)
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn changed_custody_or_selected_file_refuses_every_native_read_without_repair() -> TestResult {
    for change in ["control-body", "control-inode", "native", "raster", "stage"] {
        let source = PhysicalSource::new((3, true), true, true, true)?;
        let root = source.source.directory.0.join("changed-custody");
        let (host, owner, _) = source.physical_host("changed-custody").await?;
        let native: serde_json::Value =
            serde_json::from_slice(&fs::read(root.join(".native.json"))?)?;
        let native = root.join(native["directory"].as_str().ok_or("actual native directory")?);
        let unpublished = native.join(format!(".stage-{}", "e".repeat(64)));
        let state = host.capture_recovery_state("owner", &owner).await?;
        let expected = state.identity()?;
        let (_, inventory) = state.into_parts();
        let PhysicalServerRoomRecoveryCoverage::Verified(proof) = host
            .verify_selected_recovery_state(
                "owner",
                &owner,
                expected.clone(),
                inventory.clone(),
                source.source.protected_records(),
            )
            .await?
        else {
            return Err("complete source did not verify".into());
        };
        let path = match change {
            "control-body" | "control-inode" => root.join(".operational.json"),
            "native" => {
                let selected: serde_json::Value =
                    serde_json::from_slice(&fs::read(native.join(".component.json"))?)?;
                native
                    .join(selected["directory"].as_str().ok_or("actual native data")?)
                    .join(".head.json")
            }
            "raster" => {
                let component: serde_json::Value =
                    serde_json::from_slice(&fs::read(root.join(".rasters.json"))?)?;
                let directory =
                    root.join(component["directory"].as_str().ok_or("actual raster directory")?);
                fs::read_dir(directory)?
                    .collect::<std::io::Result<Vec<_>>>()?
                    .into_iter()
                    .find(|entry| {
                        entry
                            .file_name()
                            .to_str()
                            .is_some_and(|name| !name.starts_with('.') && name != "store.json")
                    })
                    .ok_or("original raster file")?
                    .path()
            }
            _ => unpublished,
        };
        if change == "stage" {
            let mut extra =
                fs::OpenOptions::new().write(true).create_new(true).mode(0o600).open(&path)?;
            extra.write_all(b"preserve unknown unpublished work")?;
            extra.sync_all()?;
        } else if change == "control-inode" {
            let original = fs::read(&path)?;
            fs::rename(&path, source.source.directory.0.join("preserved-original-control"))?;
            let mut replacement =
                fs::OpenOptions::new().write(true).create_new(true).mode(0o600).open(&path)?;
            replacement.write_all(&original)?;
            replacement.sync_all()?;
        } else {
            fs::write(&path, b"preserve changed source; never repair")?;
        }
        let before = snapshot(&root)?;
        assert!(host.capture_recovery_state("owner", &owner).await.is_err(), "{change}");
        assert!(host.capture_asset_recovery_state("owner", &owner).await.is_err(), "{change}");
        assert!(
            host.verify_selected_recovery_state(
                "owner",
                &owner,
                expected,
                inventory,
                source.source.protected_records(),
            )
            .await
            .is_err(),
            "{change}"
        );
        assert!(proof.check_live(&host, "owner", &owner).await.is_err(), "{change}");
        assert_eq!(snapshot(&root)?, before, "{change}");
    }
    Ok(())
}
