//! Closed read-only destination inventory. A completion record alone grants no authority.
use super::{
    ServerRoomBackup, ServerRoomRecovery, ServerRoomRecoveryProgress, files, types::Marker,
};
use crate::{
    Error, Result,
    assets::{AssetRecoveryPolicy, AssetRestore},
};
use std::{collections::BTreeSet, fs};
impl ServerRoomRecovery {
    pub(super) fn log_stage(&self) -> std::path::PathBuf {
        self.root.join(format!(".room-{}", self.marker.id))
    }
    pub(super) fn ready_stage(&self) -> std::path::PathBuf {
        self.root.join(format!(".ready-{}", self.marker.id))
    }
    pub(super) fn completion(&self) -> Result<Vec<u8>> {
        Ok(serde_json::to_vec(&Marker {
            format: "breditor/server-room-recovery-complete".into(),
            format_version: 1,
            id: self.marker.id.clone(),
            identity: self.marker.identity.clone(),
        })?)
    }
    pub(super) fn scan_root(&self, backup: &ServerRoomBackup) -> Result<()> {
        if self.marker.identity != backup.identity {
            return Err(Error::Contract("server recovery selected archive"));
        }
        files::guard_lock(&self.root, &self.lock)?;
        files::compare(
            &self.root.join(".recovery.json"),
            &serde_json::to_vec(&self.marker)?,
            false,
        )?;
        let log = backup.room.original_log();
        for (path, bytes, partial) in
            [(self.log_stage(), log, true), (self.root.join("room.log"), log, false)]
        {
            if files::exists(&path)? {
                files::compare(&path, bytes, partial)?;
            }
        }
        let ready = self.completion()?;
        for (path, partial) in [(self.ready_stage(), true), (self.root.join(".ready.json"), false)]
        {
            if files::exists(&path)? {
                files::compare(&path, &ready, partial)?;
            }
        }
        let allowed = BTreeSet::from([
            ".lock".to_owned(),
            ".recovery.json".into(),
            ".ready.json".into(),
            "room.log".into(),
            "assets".into(),
            format!(".room-{}", self.marker.id),
            format!(".ready-{}", self.marker.id),
        ]);
        let mut count = 0;
        for entry in fs::read_dir(&self.root)? {
            count += 1;
            let entry = entry?;
            let name = entry
                .file_name()
                .into_string()
                .map_err(|_| Error::Contract("server recovery filename"))?;
            let kind = entry.file_type()?;
            if count > allowed.len()
                || !allowed.contains(&name)
                || if name == "assets" { !kind.is_dir() } else { !kind.is_file() }
            {
                return Err(Error::Contract("server recovery unknown entry"));
            }
        }
        Ok(())
    }
    /// Inspect exact durable prefixes without publishing, deleting or replaying server operations.
    /// # Errors
    /// Rejects foreign/changed selections, unknown files, invalid prefixes and conflicting owners.
    pub fn progress(&self, backup: &ServerRoomBackup) -> Result<ServerRoomRecoveryProgress> {
        self.scan_root(backup)?;
        let assets = if files::exists(&self.root.join("assets"))? {
            let attempt = AssetRestore::resume(
                &self.root.join("assets"),
                &backup.assets,
                &backup.identity.assets,
                AssetRecoveryPolicy::HostReacquired,
            )?;
            Some(attempt.progress(&backup.assets)?)
        } else {
            None
        };
        let log_published = files::exists(&self.root.join("room.log"))?;
        let completion_record = files::exists(&self.root.join(".ready.json"))?;
        if completion_record && (!log_published || !assets.is_some_and(|a| a.ready)) {
            return Err(Error::Contract("server recovery incomplete completion record"));
        }
        Ok(ServerRoomRecoveryProgress { log_published, assets, completion_record })
    }
}
