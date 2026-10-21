//! Append only an actual owned marker prefix, sync, link absent target, retire only its alias.
use super::super::files;
use super::{
    context::Context,
    interruption::{Interruption, Point},
};
use crate::{Error, Result, log::generations::GenerationDirectory};
use std::{
    fs,
    io::{Seek, SeekFrom, Write},
};
impl Context {
    pub fn publish(&self, directory: &GenerationDirectory, stop: &Interruption) -> Result<()> {
        let published = self.guard(directory)?;
        let stage = directory.path.join(&self.intent.stage);
        let target = directory.path.join(".operational.json");
        let staged = files::exists(&stage)?;
        let source = if staged { &stage } else { &target };
        let mut file = files::open(source)?;
        self.intent.witness.guard(&file, source)?;
        if published {
            self.intent.witness.guard(&file, &target)?;
        }
        files::compare(&mut file, &self.bytes, !published)?;
        if !published {
            let length = usize::try_from(file.metadata()?.len())
                .map_err(|_| Error::Contract("operational marker length"))?;
            file.seek(SeekFrom::End(0))?;
            #[cfg(test)]
            if stop.point == Some(Point::DataPrefix) {
                file.write_all(&self.bytes[length..(length + 1).min(self.bytes.len())])?;
                file.sync_all()?;
                stop.after(Point::DataPrefix)?;
            }
            file.write_all(
                self.bytes
                    .get(length..)
                    .ok_or(Error::Contract("operational marker prefix length"))?,
            )?;
            file.sync_all()?;
            files::compare(&mut file, &self.bytes, false)?;
            stop.after(Point::DataSynced)?;
            directory.guard()?;
            self.intent.witness.guard(&file, &stage)?;
            fs::hard_link(&stage, &target)?;
            directory.sync()?;
            stop.after(Point::MarkerLinked)?;
        }
        self.intent.witness.guard(&file, &target)?;
        if staged {
            self.intent.witness.guard(&file, &stage)?;
            fs::remove_file(&stage)?;
            directory.sync()?;
            stop.after(Point::StageRetired)?;
        }
        drop(file);
        if !self.guard(directory)? {
            return Err(Error::Contract("operational generation marker not committed"));
        }
        Ok(())
    }
}
