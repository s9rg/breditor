//! Stage and verify a smaller representation before replacing one selected immutable inode.
use super::{
    format,
    held_file::FileIdentity,
    options::generation,
    packed_wal::{self, HeldWal, ServerSealedWalPacking},
    state::Generations,
};
use crate::{Error, Result, credentials, log::Log};
use std::{fs, io, sync::Arc};

#[cfg(test)]
#[derive(Clone, Copy, PartialEq)]
pub(crate) enum WalPackingInterruption {
    BeforeRename,
    AfterSync,
}

impl Generations {
    fn pack_sealed_wal(
        &mut self,
        active: &fs::File,
        active_bytes: u64,
        generation: &str,
        #[cfg(test)] stop: Option<WalPackingInterruption>,
    ) -> Result<ServerSealedWalPacking> {
        self.verify_inventory()?;
        self.directory.absent(".rotation.json")?;
        if self.ready_name != ".ready.json" || self.opening_length.is_some() {
            return Err(Error::Contract("packing requires a complete published generation log"));
        }
        let position = self
            .closed
            .iter()
            .position(|wal| wal.generation == generation)
            .ok_or(Error::Contract("packing requires a selected sealed WAL"))?;
        let current = &self.current().value;
        let selected = current
            .closed_files()
            .map(|(file, _)| file)
            .nth(position)
            .ok_or(Error::Contract("sealed WAL manifest entry absent"))?;
        let held = &self.closed[position];
        let result = held.packing();
        if result.packed {
            return Ok(result);
        }
        if held.archived {
            return Err(Error::Contract("pack WAL before archiving it"));
        }
        let path = self.directory.path.join(format::wal_name(generation));
        held.guard(&path)?;
        require_unaliased(&held.file)?;
        self.clear_packing_stages()?;
        let name = format!("{}{}", packed_wal::STAGE_PREFIX, credentials::issue()?);
        let stage = self.directory.create_file(&name, &[])?;
        let stage_path = self.directory.path.join(&name);
        let identity = FileIdentity::of(&stage)?;
        packed_wal::write(held, selected, &stage)?;
        if stage.metadata()?.len() >= held.bytes {
            identity.guard(&stage, &stage_path)?;
            fs::remove_file(&stage_path)?;
            self.directory.sync()?;
            return Ok(result);
        }
        let replacement = HeldWal::open(stage, selected)?;
        replacement.read(selected.sha256, |reader| {
            io::copy(reader, &mut io::sink())?;
            Ok(())
        })?;
        self.guard(active, active_bytes)?;
        self.verify_inventory()?;
        self.directory.absent(".rotation.json")?;
        replacement.guard(&stage_path)?;
        require_unaliased(&held.file)?;
        require_unaliased(&replacement.file)?;
        #[cfg(test)]
        if stop == Some(WalPackingInterruption::BeforeRename) {
            return Err(Error::NeedsRecovery);
        }
        // Both sides of this single-name rename represent the same manifest cut.
        fs::rename(&stage_path, &path)?;
        self.directory.sync()?;
        #[cfg(test)]
        if stop == Some(WalPackingInterruption::AfterSync) {
            return Err(Error::NeedsRecovery);
        }
        // Rename can legitimately change the new inode's ctime.
        let replacement = HeldWal::open(replacement.file, selected)?;
        identity.guard(&replacement.file, &path)?;
        replacement.read(selected.sha256, |reader| {
            io::copy(reader, &mut io::sink())?;
            Ok(())
        })?;
        let result = replacement.packing();
        self.closed[position] = Arc::new(replacement);
        self.guard(active, active_bytes)?;
        Ok(result)
    }

    fn clear_packing_stages(&self) -> Result<()> {
        for entry in fs::read_dir(&self.directory.path)? {
            let entry = entry?;
            if !packed_wal::is_stage(&entry.file_name().to_string_lossy()) {
                continue;
            }
            // A packing stage is never selected by a manifest. While holding the
            // directory lock, only remove an unaliased inode at that exact stage name.
            let path = entry.path();
            let stage = super::held_file::open(&path)?;
            require_unaliased(&stage)?;
            self.directory.guard()?;
            FileIdentity::of(&stage)?.guard(&stage, &path)?;
            fs::remove_file(&path)?;
            self.directory.sync()?;
        }
        Ok(())
    }
}

fn require_unaliased(file: &fs::File) -> Result<()> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        if file.metadata()?.nlink() == 1 {
            return Ok(());
        }
    }
    #[cfg(not(unix))]
    let _ = file;
    Err(Error::Contract("sealed WAL packing requires unaliased storage"))
}

impl Log {
    pub(crate) fn pack_sealed_wal(&mut self, id: &str) -> Result<ServerSealedWalPacking> {
        self.pack_selected_sealed_wal(
            id,
            #[cfg(test)]
            None,
        )
    }

    #[cfg(test)]
    pub(crate) fn interrupt_wal_packing(
        &mut self,
        id: &str,
        stop: WalPackingInterruption,
    ) -> Result<ServerSealedWalPacking> {
        self.pack_selected_sealed_wal(id, Some(stop))
    }

    fn pack_selected_sealed_wal(
        &mut self,
        id: &str,
        #[cfg(test)] stop: Option<WalPackingInterruption>,
    ) -> Result<ServerSealedWalPacking> {
        self.ready()?;
        generation(id)?;
        let state =
            self.generations.as_mut().ok_or(Error::Contract("original log does not pack WALs"))?;
        let result = state.pack_sealed_wal(
            &self.file,
            self.bytes,
            id,
            #[cfg(test)]
            stop,
        );
        // Refused choices leave the old source live. Physical I/O or failed custody after
        // replacement means a cold reopen is required.
        if result.is_err()
            && (matches!(result, Err(Error::Io(_) | Error::NeedsRecovery)) || self.ready().is_err())
        {
            self.invalidate();
        }
        result
    }
}
