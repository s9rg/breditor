//! Publish only complete credential-free fixture inputs, never private control IPC.
use super::{Result, storage};
use std::path::{Path, PathBuf};

pub struct LegacyFiles<'a> {
    pub archive: &'a [u8],
    pub wal: &'a [u8],
}

pub struct PublicInputs<'a> {
    pub directory: &'a Path,
    pub fixture: &'a str,
    pub inventory: &'a str,
    pub origin: &'a [u8],
    pub older: &'a [u8],
    pub current: &'a [u8],
    pub legacy: Option<LegacyFiles<'a>>,
    pub credentials: &'a [&'a str],
}
pub fn write(input: &PublicInputs<'_>) -> Result<PathBuf> {
    let mut files = Vec::from([
        ("fixture.json", input.fixture.as_bytes()),
        ("inventory.json", input.inventory.as_bytes()),
        ("inventory-after.json", input.inventory.as_bytes()),
        ("server.backup", input.origin),
        ("older-server.backup", input.older),
        ("server-after.backup", input.current),
    ]);
    if let Some(legacy) = &input.legacy {
        files.push(("legacy-server.backup", legacy.archive));
        files.push(("legacy-native.wal", legacy.wal));
    }
    for credential in input.credentials {
        if credential.is_empty()
            || files.iter().any(|(_, bytes)| {
                bytes.windows(credential.len()).any(|chunk| chunk == credential.as_bytes())
            })
        {
            return Err("private credential entered a public fixture input".into());
        }
    }
    for (name, bytes) in files {
        storage::write_new(&input.directory.join(name), bytes)?;
    }
    Ok(input.directory.join("fixture.json"))
}
