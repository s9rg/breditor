//! Publish only complete credential-free fixture inputs, never private control IPC.
use super::{Result, storage};
use std::path::{Path, PathBuf};

pub struct PublicInputs<'a> {
    pub directory: &'a Path,
    pub fixture: &'a str,
    pub inventory: &'a str,
    pub ancestor: &'a [u8],
    pub current: &'a [u8],
    pub credentials: &'a [&'a str],
}
pub fn write(input: &PublicInputs<'_>) -> Result<PathBuf> {
    let files = [
        ("fixture.json", input.fixture.as_bytes()),
        ("inventory.json", input.inventory.as_bytes()),
        ("inventory-after.json", input.inventory.as_bytes()),
        ("server.backup", input.ancestor),
        ("server-after.backup", input.current),
    ];
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
