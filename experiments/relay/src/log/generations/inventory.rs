//! A bounded exact selected closure, with separately retained unpublished stages. No scavenging.
use super::{format, held_file::FileIdentity, packed_wal, rotate, state::Generations};
use crate::{Error, Result, credentials};
use std::{collections::BTreeSet, fs};

impl Generations {
    pub(super) fn verify_inventory(&self) -> Result<usize> {
        self.directory.guard()?;
        let mut known: BTreeSet<String> =
            [".owner", ".head.json", self.ready_name].into_iter().map(String::from).collect();
        if self.ready_name == ".prepared.json" {
            match fs::symlink_metadata(self.directory.path.join(".ready.json")) {
                Ok(_) => {
                    self.ready_identity
                        .guard(&self.ready, &self.directory.path.join(".ready.json"))?;
                    known.insert(".ready.json".into());
                }
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(error) => return Err(error.into()),
            }
        }
        for manifest in &self.history {
            known.insert(format::manifest_name(&manifest.hash));
        }
        for file in &self.closed {
            known.insert(format::wal_name(&file.generation));
        }
        known.insert(format::wal_name(&self.current().value.active.generation));
        known.extend(rotate::pending_names(&self.directory)?);
        let mut entries = 0;
        let mut stages = 0;
        let mut packing_stages = 0;
        let mut stage_bytes = 0_u64;
        for entry in fs::read_dir(&self.directory.path)? {
            entries += 1;
            if entries > format::MAX_GENERATIONS * 3 + 8 + packed_wal::MAX_STAGES {
                return Err(Error::Contract("physical log directory entry budget"));
            }
            let entry = entry?;
            let name = entry
                .file_name()
                .into_string()
                .map_err(|_| Error::Contract("physical log directory filename"))?;
            let metadata = fs::symlink_metadata(entry.path())?;
            if !metadata.is_file() {
                return Err(Error::Contract("physical log directory contains a non-file"));
            }
            let file = fs::File::open(entry.path())?;
            FileIdentity::of(&file)?.guard(&file, &entry.path())?;
            if known.contains(&name) {
                if name.starts_with(super::rotation_recovery_stages::PREFIX)
                    && metadata.len() > format::MAX_CONTROL
                {
                    return Err(Error::Contract("rotation recovery stage byte budget"));
                }
                continue;
            }
            if let Some(nonce) = name.strip_prefix(packed_wal::STAGE_PREFIX) {
                credentials::hash(nonce)?;
                packing_stages += 1;
                if packing_stages > packed_wal::MAX_STAGES
                    || metadata.len() > packed_wal::MAX_STAGE_BYTES
                {
                    return Err(Error::Contract("sealed WAL packing stage budget"));
                }
                continue;
            }
            let nonce = name
                .strip_prefix(".stage-")
                .ok_or(Error::Contract("physical log directory has unselected data"))?;
            credentials::hash(nonce)?;
            stages += 1;
            stage_bytes = stage_bytes
                .checked_add(metadata.len())
                .ok_or(Error::Contract("physical log stage byte overflow"))?;
            if stages > format::MAX_GENERATIONS
                || metadata.len() > format::MAX_CONTROL
                || stage_bytes > format::MAX_MANIFEST_BYTES
            {
                return Err(Error::Contract("unpublished physical log stage budget"));
            }
            // A bounded private stage is never admitted as history, overwritten or removed here.
            // Only the synced intent's saved inode can complete an interrupted publication.
        }
        self.directory.guard()?;
        Ok(stages)
    }
}
