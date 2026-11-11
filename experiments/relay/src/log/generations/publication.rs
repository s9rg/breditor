//! Sync owned stages, then publish exact names. Never adopt an unrelated occupied target.
use super::{
    directory::Directory,
    format,
    held_file::{self, FileIdentity},
};
use crate::{Error, Result, credentials};
use std::fs::{self, File};

pub(super) fn insert(directory: &Directory, name: &str, bytes: &[u8]) -> Result<File> {
    directory.absent(name)?;
    let stage = format!(".stage-{}", credentials::issue()?);
    let file = directory.create_file(&stage, bytes)?;
    FileIdentity::of(&file)?.guard(&file, &directory.path.join(&stage))?;
    fs::hard_link(directory.path.join(&stage), directory.path.join(name))?;
    directory.sync()?;
    fs::remove_file(directory.path.join(stage))?;
    directory.sync()?;
    Ok(file)
}
pub(super) fn replace_head(
    directory: &Directory,
    held: &File,
    expected: &[u8],
    bytes: &[u8],
) -> Result<File> {
    let path = directory.path.join(".head.json");
    guard_head(directory, held, expected, "physical log head differs before publication")?;
    let stage = format!(".stage-{}", credentials::issue()?);
    let next = directory.create_file(&stage, bytes)?;
    guard_head(directory, held, expected, "physical log head changed during staging")?;
    FileIdentity::of(&next)?.guard(&next, &directory.path.join(&stage))?;
    fs::rename(directory.path.join(stage), path)?;
    directory.sync()?;
    Ok(next)
}

pub(super) fn guard_head(
    directory: &Directory,
    held: &File,
    expected: &[u8],
    reason: &'static str,
) -> Result<()> {
    directory.guard()?;
    FileIdentity::of(held)?.guard(held, &directory.path.join(".head.json"))?;
    if held_file::read(held, format::MAX_CONTROL)? != expected {
        return Err(Error::Contract(reason));
    }
    Ok(())
}
