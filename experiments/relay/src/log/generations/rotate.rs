//! Physical rotation: verify -> sync intent -> link exact owned inode -> sync head -> publish.
use super::{
    directory::Directory,
    format,
    held_file::{self, FileIdentity, FileStamp},
    manifest::{ActiveFile, ClosedFile, Manifest},
    options::generation,
    publication,
    receipt::ServerLogGenerationReceipt,
    state::{Generations, HeldManifest, HeldWal},
};
use crate::{
    Error, Result, credentials,
    log::{Log, decoder, frame},
};
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeSet,
    fs,
    io::{Seek, SeekFrom},
};

pub(super) fn pending_names(directory: &Directory) -> Result<BTreeSet<String>> {
    let path = directory.path.join(".rotation.json");
    match fs::symlink_metadata(&path) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(BTreeSet::new()),
        Err(error) => return Err(error.into()),
        Ok(_) => {}
    }
    let file = held_file::open(&path)?;
    let intent: Intent = format::decode(&held_file::read(&file, format::MAX_CONTROL)?)?;
    intent.validate()?;
    Ok([
        ".rotation.json".into(),
        format::wal_name(&intent.next),
        format::manifest_name(&intent.after),
    ]
    .into_iter()
    .collect())
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Intent {
    format: String,
    format_version: u32,
    before: [u8; 32],
    after: [u8; 32],
    next: String,
    sealed: ClosedFile,
    stage: String,
    identity: FileIdentity,
}
impl Intent {
    fn validate(&self) -> Result<()> {
        if self.format != "breditor/relay-log-rotation" || self.format_version != 1 {
            return Err(Error::Contract("physical log rotation intent family"));
        }
        generation(&self.next)?;
        let nonce =
            self.stage.strip_prefix(".stage-").ok_or(Error::Contract("rotation stage name"))?;
        credentials::hash(nonce)?;
        Ok(())
    }
}
impl Generations {
    fn child(&self, next: &str, sealed: ClosedFile) -> Result<Manifest> {
        let mut child = self.current().value.clone();
        child.parent = Some(self.current().hash);
        child.active = ActiveFile {
            generation: next.into(),
            first: sealed.next()?,
            previous: sealed.terminal,
        };
        child.sealed.push(sealed);
        child.follows(&self.current().value, self.current().hash)?;
        Ok(child)
    }
    fn active_cut(&self, log: &mut Log) -> Result<ClosedFile> {
        self.guard(&log.file, log.bytes)?;
        let bytes = held_file::read(&log.file, super::super::MAX_LOG)?;
        log.file.seek(SeekFrom::Start(log.bytes))?;
        self.guard(&log.file, log.bytes)?;
        let active = &self.current().value.active;
        let parsed = decoder::read_records_from(
            &mut bytes.as_slice(),
            bytes.len() as u64,
            frame::Family::Continuation,
            active.first,
            active.previous,
        )?;
        if parsed.recovery.truncated_bytes != 0
            || parsed.bytes != log.bytes
            || parsed.previous != log.previous
            || active.first.checked_add(parsed.records.len() as u64) != Some(log.next)
        {
            return Err(Error::Contract("physical rotation source cut differs"));
        }
        Ok(ClosedFile {
            generation: active.generation.clone(),
            first: active.first,
            records: parsed.records.len() as u64,
            previous: active.previous,
            terminal: log.previous,
            bytes: log.bytes,
            sha256: format::sha(&bytes),
        })
    }
    fn prepare(&self, log: &mut Log, next: &str) -> Result<()> {
        self.verify_inventory()?;
        self.directory.absent(".rotation.json")?;
        self.directory.absent(&format::wal_name(next))?;
        self.verify_retained()?;
        let sealed = self.active_cut(log)?;
        let child = self.child(next, sealed.clone())?;
        let after = format::sha(&format::encode(&child)?);
        let stage = format!(".stage-{}", credentials::issue()?);
        let file = self.directory.create_file(&stage, &[])?;
        #[cfg(test)]
        self.interrupt(super::RotationPoint::ContinuationReady)?;
        let intent = Intent {
            format: "breditor/relay-log-rotation".into(),
            format_version: 1,
            before: self.current().hash,
            after,
            next: next.into(),
            sealed,
            identity: FileIdentity::of(&file)?,
            stage,
        };
        let marker =
            publication::insert(&self.directory, ".rotation.json", &format::encode(&intent)?)?;
        // The directory lease remains held. Cold/live resume reacquires only this exact inode.
        drop(marker);
        drop(file);
        #[cfg(test)]
        self.interrupt(super::RotationPoint::IntentSynced)?;
        Ok(())
    }
    fn clean_intent(
        &self,
        intent: &Intent,
        marker: &fs::File,
        marker_bytes: &[u8],
        active: &fs::File,
    ) -> Result<()> {
        self.directory.guard()?;
        let stage = self.directory.path.join(&intent.stage);
        match fs::symlink_metadata(&stage) {
            Ok(_) => {
                intent.identity.guard(active, &stage)?;
                fs::remove_file(stage)?;
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.into()),
        }
        let path = self.directory.path.join(".rotation.json");
        #[cfg(test)]
        self.interrupt(super::RotationPoint::StageRetired)?;
        self.directory.guard()?;
        FileIdentity::of(marker)?.guard(marker, &path)?;
        if held_file::read(marker, format::MAX_CONTROL)? != marker_bytes {
            return Err(Error::Contract("physical log rotation marker changed"));
        }
        fs::remove_file(path)?;
        self.directory.sync()?;
        #[cfg(test)]
        self.interrupt(super::RotationPoint::IntentRetired)?;
        Ok(())
    }
    fn resume(&mut self, log: &mut Log) -> Result<Option<ServerLogGenerationReceipt>> {
        let path = self.directory.path.join(".rotation.json");
        match fs::symlink_metadata(&path) {
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(error) => return Err(error.into()),
            Ok(_) => {}
        }
        let marker = held_file::open(&path)?;
        let marker_bytes = held_file::read(&marker, format::MAX_CONTROL)?;
        let intent: Intent = format::decode(&marker_bytes)?;
        intent.validate()?;
        if self.current().hash == intent.after {
            let parent = self
                .history
                .iter()
                .rev()
                .nth(1)
                .ok_or(Error::Contract("rotation parent absent"))?;
            let child = Self::child_from_parent(parent, &intent)?;
            if child != self.current().value || log.next != child.active.first || log.bytes != 0 {
                return Err(Error::Contract("completed physical rotation cut differs"));
            }
            intent
                .identity
                .guard(&log.file, &self.directory.path.join(format::wal_name(&intent.next)))?;
            self.clean_intent(&intent, &marker, &marker_bytes, &log.file)?;
            self.refresh_active(&log.file)?;
            return Self::receipt(self.current(), true).map(Some);
        }
        if self.current().hash != intent.before || self.active_cut(log)? != intent.sealed {
            return Err(Error::Contract("physical rotation prior cut differs"));
        }
        let child = self.child(&intent.next, intent.sealed.clone())?;
        let bytes = format::encode(&child)?;
        if format::sha(&bytes) != intent.after {
            return Err(Error::Contract("physical rotation after hash differs"));
        }
        let stage = self.directory.path.join(&intent.stage);
        let final_path = self.directory.path.join(format::wal_name(&intent.next));
        let source = match fs::symlink_metadata(&stage) {
            Ok(_) => &stage,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => &final_path,
            Err(error) => return Err(error.into()),
        };
        let next = held_file::open(source)?;
        intent.identity.guard(&next, source)?;
        if next.metadata()?.len() != 0 {
            return Err(Error::Contract("unpublished continuation is not empty"));
        }
        match fs::symlink_metadata(&final_path) {
            Ok(_) => intent.identity.guard(&next, &final_path)?,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                intent.identity.guard(&next, &stage)?;
                fs::hard_link(&stage, &final_path)?;
                self.directory.sync()?;
            }
            Err(error) => return Err(error.into()),
        }
        #[cfg(test)]
        self.interrupt(super::RotationPoint::ContinuationPublished)?;
        let file = self.directory.immutable(&format::manifest_name(&intent.after), &bytes)?;
        #[cfg(test)]
        self.interrupt(super::RotationPoint::ManifestSynced)?;
        let identity = FileIdentity::of(&file)?;
        let head_bytes = Self::head_bytes(intent.after)?;
        let head =
            publication::replace_head(&self.directory, &self.head, &self.head_bytes, &head_bytes)?;
        #[cfg(test)]
        self.interrupt(super::RotationPoint::HeadSynced)?;
        self.clean_intent(&intent, &marker, &marker_bytes, &next)?;
        let old = std::mem::replace(&mut log.file, next);
        let old_stamp = FileStamp::of(&old)?;
        self.closed.push(HeldWal {
            identity: self.active_identity,
            file: old,
            generation: intent.sealed.generation.clone(),
            bytes: intent.sealed.bytes,
            stamp: old_stamp,
        });
        self.active_identity = intent.identity;
        self.refresh_active(&log.file)?;
        self.head_identity = FileIdentity::of(&head)?;
        self.head = head;
        self.head_bytes = head_bytes;
        self.history.push(HeldManifest {
            hash: intent.after,
            value: child,
            stamp: FileStamp::of(&file)?,
            file,
            bytes,
            identity,
        });
        log.bytes = 0;
        if self.opening_length.is_some() {
            self.opening_length = Some(0);
        }
        #[cfg(test)]
        self.interrupt(super::RotationPoint::MemoryUpdated)?;
        Self::receipt(self.current(), false).map(Some)
    }
    fn child_from_parent(parent: &HeldManifest, intent: &Intent) -> Result<Manifest> {
        if parent.hash != intent.before {
            return Err(Error::Contract("rotation parent hash differs"));
        }
        let mut child = parent.value.clone();
        child.parent = Some(parent.hash);
        child.active = ActiveFile {
            generation: intent.next.clone(),
            first: intent.sealed.next()?,
            previous: intent.sealed.terminal,
        };
        child.sealed.push(intent.sealed.clone());
        child.follows(&parent.value, parent.hash)?;
        if format::sha(&format::encode(&child)?) != intent.after {
            return Err(Error::Contract("completed rotation manifest hash differs"));
        }
        Ok(child)
    }
}
impl Log {
    pub(crate) fn rotate_generations(&mut self, next: &str) -> Result<ServerLogGenerationReceipt> {
        self.ready()?;
        generation(next)?;
        let state =
            self.generations.as_ref().ok_or(Error::Contract("original log does not rotate"))?;
        if let Some(receipt) = state.retry(next)? {
            return Ok(receipt);
        }
        if state.current().value.contains(next)
            || state.current().value.sealed.len() + 3 > format::MAX_GENERATIONS
            || self.next == state.active_first()
        {
            return Err(Error::Contract("physical rotation generation or capacity"));
        }
        self.poisoned = true;
        let mut state = self.generations.take().ok_or(Error::NeedsRecovery)?;
        let result = state
            .prepare(self, next)
            .and_then(|()| state.resume(self))
            .and_then(|value| value.ok_or(Error::Contract("rotation receipt absent")));
        self.generations = Some(state);
        if result.is_ok() {
            self.poisoned = false;
            if let Err(error) = self.ready() {
                self.poisoned = true;
                return Err(error);
            }
        }
        result
    }
    pub(in crate::log) fn recover_generation_rotation(&mut self) -> Result<()> {
        let Some(mut state) = self.generations.take() else {
            return Ok(());
        };
        let result = state.resume(self);
        self.generations = Some(state);
        if result.is_err() {
            self.poisoned = true;
        }
        result.map(|_| ())
    }
    pub(in crate::log) fn auto_rotate_generations(&mut self) -> Result<()> {
        let state = self
            .generations
            .as_ref()
            .ok_or(Error::Contract("original log has no auto rotation"))?;
        for salt in 0..=format::MAX_GENERATIONS {
            let id = format!("auto-{}-{salt}", format::hex(&state.current().hash));
            if !state.current().value.contains(&id) {
                self.rotate_generations(&id)?;
                return Ok(());
            }
        }
        Err(Error::Contract("automatic physical generation identity budget"))
    }
}
