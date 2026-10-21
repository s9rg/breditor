//! Actual per-file inode intent before body writes, followed by insert-only publication.
use super::{
    ServerLogGenerationRoomRecovery, files,
    raster_directory::RasterDirectory,
    selection::{RasterComponent, RasterPart},
};
use crate::{Error, Result, credentials, log::generations::GenerationFileWitness};
use std::{
    fs,
    io::{Seek, SeekFrom, Write},
};
pub(super) fn ledger(name: &str) -> String {
    format!(".raster-part-{}.json", files::key(name))
}
impl ServerLogGenerationRoomRecovery {
    pub(super) fn raster_part(
        &self,
        component: &RasterComponent,
        name: &str,
        expected: &[u8],
    ) -> Result<Option<RasterPart>> {
        selected_part(&self.directory, &self.marker.id, component, name, expected)
    }
}
pub(super) fn selected_part(
    directory: &crate::log::generations::GenerationDirectory,
    recovery: &str,
    component: &RasterComponent,
    name: &str,
    expected: &[u8],
) -> Result<Option<RasterPart>> {
    let path = directory.path.join(ledger(name));
    if !files::exists(&path)? {
        return Ok(None);
    }
    let part: RasterPart = files::read(&path)?;
    credentials::hash(
        part.stage
            .strip_prefix(".raster-data-")
            .ok_or(Error::Contract("joined raster stage name"))?,
    )?;
    if part.format != "breditor/joined-generation-raster-part"
        || part.format_version != 1
        || part.recovery != recovery
        || part.directory != component.directory
        || part.name != name
        || part.bytes != expected.len() as u64
        || part.sha256 != files::sha(expected)
    {
        return Err(Error::Contract("joined raster part selection differs"));
    }
    Ok(Some(part))
}
impl ServerLogGenerationRoomRecovery {
    fn new_raster_part(
        &self,
        component: &RasterComponent,
        directory: &RasterDirectory,
        name: &str,
        expected: &[u8],
    ) -> Result<RasterPart> {
        if files::exists(&directory.path.join(name))? {
            return Err(Error::Contract("joined raster occupied unowned file"));
        }
        let stage = format!(".raster-data-{}", credentials::issue()?);
        let file = self.directory.create_file(&stage, &[])?;
        #[cfg(test)]
        self.interrupt(super::interruption::JoinedPoint::RasterStageCreated)?;
        let part = RasterPart {
            format: "breditor/joined-generation-raster-part".into(),
            format_version: 1,
            recovery: self.marker.id.clone(),
            directory: component.directory.clone(),
            name: name.into(),
            bytes: expected.len() as u64,
            sha256: files::sha(expected),
            stage,
            witness: GenerationFileWitness::of(&file)?,
        };
        files::insert(&self.directory, &ledger(name), &files::encode(&part)?)?;
        #[cfg(test)]
        self.interrupt(super::interruption::JoinedPoint::RasterPartSelected)?;
        Ok(part)
    }
    pub(super) fn raster_part_progress(
        &self,
        directory: &RasterDirectory,
        part: &RasterPart,
        expected: &[u8],
    ) -> Result<bool> {
        directory.guard()?;
        let final_path = directory.path.join(&part.name);
        let stage = self.directory.path.join(&part.stage);
        let published = files::exists(&final_path)?;
        let source = if files::exists(&stage)? {
            &stage
        } else if published {
            &final_path
        } else {
            return Err(Error::Contract("joined raster owned part missing"));
        };
        let mut file = files::open(source)?;
        part.witness.guard(&file, source)?;
        if published {
            part.witness.guard(&file, &final_path)?;
        }
        files::compare(&mut file, expected, !published)?;
        Ok(published)
    }
    pub(super) fn restore_raster_part(
        &self,
        component: &RasterComponent,
        directory: &RasterDirectory,
        name: &str,
        expected: &[u8],
    ) -> Result<()> {
        self.directory.guard()?;
        directory.guard()?;
        let part = if let Some(part) = self.raster_part(component, name, expected)? {
            part
        } else {
            self.new_raster_part(component, directory, name, expected)?
        };
        let final_path = directory.path.join(name);
        let stage = self.directory.path.join(&part.stage);
        let staged = files::exists(&stage)?;
        let published = files::exists(&final_path)?;
        let source = if staged {
            &stage
        } else if published {
            &final_path
        } else {
            return Err(Error::Contract("joined raster owned stage missing"));
        };
        let mut file = files::open(source)?;
        part.witness.guard(&file, source)?;
        if published {
            part.witness.guard(&file, &final_path)?;
        }
        files::compare(&mut file, expected, !published)?;
        if !published {
            let length = usize::try_from(file.metadata()?.len())
                .map_err(|_| Error::Contract("joined raster part length"))?;
            file.seek(SeekFrom::End(0))?;
            #[cfg(test)]
            if self.stop_after == Some(super::interruption::JoinedPoint::RasterDataPrefix) {
                file.write_all(&expected[length..(length + 1).min(expected.len())])?;
                file.sync_all()?;
                self.interrupt(super::interruption::JoinedPoint::RasterDataPrefix)?;
            }
            file.write_all(
                expected.get(length..).ok_or(Error::Contract("joined raster part suffix"))?,
            )?;
            file.sync_all()?;
            files::compare(&mut file, expected, false)?;
            #[cfg(test)]
            self.interrupt(super::interruption::JoinedPoint::RasterDataSynced)?;
            self.directory.guard()?;
            directory.guard()?;
            part.witness.guard(&file, &stage)?;
            fs::hard_link(&stage, &final_path)?;
            directory.sync()?;
            #[cfg(test)]
            self.interrupt(super::interruption::JoinedPoint::RasterFilePublished)?;
        }
        part.witness.guard(&file, &final_path)?;
        if staged {
            part.witness.guard(&file, &stage)?;
            fs::remove_file(stage)?;
            self.directory.sync()?;
            #[cfg(test)]
            self.interrupt(super::interruption::JoinedPoint::RasterStageRetired)?;
        }
        directory.guard()
    }
}
