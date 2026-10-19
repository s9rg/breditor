//! Closed canonical storage provenance; a serialized marker alone never admits a live owner.
use super::super::{ServerRoomBackup, files, types::Marker};
use crate::{Error, Result, credentials};
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeSet,
    fs::{self, File},
    path::{Path, PathBuf},
};

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct OperationMarker {
    format: String,
    format_version: u32,
    recovery_id: String,
    origin: super::ServerRoomBackupIdentity,
}

#[derive(Clone, Copy, Eq, PartialEq)]
pub(super) enum Intent {
    Missing,
    Staged,
    Committed,
}

pub(super) struct Context {
    pub bytes: Vec<u8>,
    pub stage: PathBuf,
    pub target: PathBuf,
    pub intent: Intent,
}

impl Context {
    pub fn read(root: &Path, lock: &File, backup: &ServerRoomBackup) -> Result<Self> {
        files::guard_lock(root, lock)?;
        let encoded = files::read_marker(&root.join(".recovery.json"))?;
        let marker: Marker = serde_json::from_slice(&encoded)?;
        if marker.format != "breditor/server-room-recovery"
            || marker.format_version != 1
            || marker.identity != backup.identity
            || credentials::hash(&marker.id).is_err()
            || serde_json::to_vec(&marker)? != encoded
        {
            return Err(Error::Contract("operational recovery provenance differs"));
        }
        let ready = Marker {
            format: "breditor/server-room-recovery-complete".into(),
            format_version: 1,
            id: marker.id.clone(),
            identity: marker.identity.clone(),
        };
        files::compare(&root.join(".ready.json"), &serde_json::to_vec(&ready)?, false)?;
        let stage_name = format!(".operational-{}", marker.id);
        let allowed = BTreeSet::from([
            ".lock".to_owned(),
            ".recovery.json".into(),
            ".ready.json".into(),
            "room.log".into(),
            "assets".into(),
            ".operational.json".into(),
            stage_name.clone(),
        ]);
        let mut found = BTreeSet::new();
        for entry in fs::read_dir(root)? {
            let entry = entry?;
            let name = entry
                .file_name()
                .into_string()
                .map_err(|_| Error::Contract("operational filename"))?;
            let kind = entry.file_type()?;
            if !allowed.contains(&name)
                || !found.insert(name.clone())
                || if name == "assets" { !kind.is_dir() } else { !kind.is_file() }
            {
                return Err(Error::Contract("operational unknown entry or type"));
            }
        }
        for name in [".lock", ".recovery.json", ".ready.json", "room.log", "assets"] {
            if !found.contains(name) {
                return Err(Error::Contract("operational component absent"));
            }
        }
        let bytes = serde_json::to_vec(&OperationMarker {
            format: "breditor/server-room-operational".into(),
            format_version: 1,
            recovery_id: marker.id,
            origin: marker.identity,
        })?;
        let target = root.join(".operational.json");
        let stage = root.join(stage_name);
        let committed = files::exists(&target)?;
        if committed {
            files::compare(&target, &bytes, false)?;
        }
        let staged = files::exists(&stage)?;
        if staged {
            files::compare(&stage, &bytes, !committed)?;
        }
        Ok(Self {
            bytes,
            stage,
            target,
            intent: if committed {
                Intent::Committed
            } else if staged {
                Intent::Staged
            } else {
                Intent::Missing
            },
        })
    }

    pub fn guard(&self, root: &Path, lock: &File, backup: &ServerRoomBackup) -> Result<()> {
        let current = Self::read(root, lock, backup)?;
        if current.bytes != self.bytes
            || current.stage != self.stage
            || current.target != self.target
            || current.intent != self.intent
        {
            return Err(Error::Contract("operational intent changed outside owner"));
        }
        Ok(())
    }

    pub fn publish(&self, root: &Path) -> Result<()> {
        if !files::exists(&self.target)? || files::exists(&self.stage)? {
            files::prepare(&self.stage, &self.bytes)?;
        }
        files::publish(root, &self.stage, &self.target, &self.bytes)?;
        files::retire(root, &self.stage, &self.bytes)
    }
}
