//! Anchor the actual namespace, not a later file at a reused path.
use crate::{Error, Result};
#[cfg(unix)]
use std::fs;
use std::{fs::File, path::Path};
pub(super) fn supported() -> Result<()> {
    if cfg!(unix) {
        Ok(())
    } else {
        Err(Error::Contract("native deployment file identity backend unavailable"))
    }
}
#[cfg(unix)]
pub(super) fn check(root: &Path, directory: &File, ledger: &File) -> Result<()> {
    use std::os::unix::fs::MetadataExt;
    let d = fs::symlink_metadata(root)?;
    let f = fs::symlink_metadata(root.join("authority.log"))?;
    let held_d = directory.metadata()?;
    let held_f = ledger.metadata()?;
    if !d.is_dir()
        || !f.is_file()
        || (d.dev(), d.ino()) != (held_d.dev(), held_d.ino())
        || (f.dev(), f.ino()) != (held_f.dev(), held_f.ino())
    {
        return Err(Error::Contract("deployment namespace replaced"));
    }
    Ok(())
}
#[cfg(not(unix))]
pub(super) fn check(_root: &Path, _directory: &File, _ledger: &File) -> Result<()> {
    Err(Error::Contract("native deployment file identity backend unavailable"))
}
