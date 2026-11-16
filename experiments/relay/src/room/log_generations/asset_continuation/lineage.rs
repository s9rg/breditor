//! Exact archive boundaries and namespace continuity for immutable raster generations.
use super::FORMAT;
use crate::{
    Error, Result,
    assets::{AssetBackupIdentity, MAX_SERVER_ASSET_BACKUP_BYTES, asset_id},
    credentials,
};
use serde::{Deserialize, Serialize};

/// Maximum number of archived stores admitted behind one writable raster store.
pub(super) const MAX_RETAINED_GENERATIONS: usize = 64;
pub(super) const MAX_RETAINED_ARCHIVE_BYTES: u64 =
    MAX_RETAINED_GENERATIONS as u64 * MAX_SERVER_ASSET_BACKUP_BYTES;

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Lineage {
    pub(super) predecessor: AssetBackupIdentity,
    namespace: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    root_archive_bytes: Option<u64>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    sealed: Vec<SealedGeneration>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SealedGeneration {
    namespace: String,
    archive: AssetBackupIdentity,
    archive_bytes: u64,
}

// Keep field order and omission behavior identical to the persisted lineage.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Binding<'a> {
    predecessor: &'a AssetBackupIdentity,
    namespace: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    root_archive_bytes: Option<u64>,
    #[serde(skip_serializing_if = "<[SealedGeneration]>::is_empty")]
    sealed: &'a [SealedGeneration],
}

impl Binding<'_> {
    fn active(&self) -> Result<String> {
        credentials::hash(self.namespace)?;
        let revision = if self.root_archive_bytes.is_none() { 1_u32 } else { 2 };
        Ok(asset_id(&serde_json::to_vec(&(FORMAT, revision, self))?))
    }
}

impl Lineage {
    pub(super) fn original(predecessor: AssetBackupIdentity) -> Result<Self> {
        Ok(Self {
            predecessor,
            namespace: credentials::issue()?,
            root_archive_bytes: None,
            sealed: Vec::new(),
        })
    }

    pub(super) const fn format_version(&self) -> u32 {
        if self.root_archive_bytes.is_none() { 1 } else { 2 }
    }

    pub(super) const fn control_budget(&self) -> u64 {
        if self.root_archive_bytes.is_none() { 4096 } else { 64 * 1024 }
    }

    pub(super) fn active_binding(&self) -> Result<String> {
        self.binding(&self.namespace, &self.sealed).active()
    }

    fn binding<'a>(&'a self, namespace: &'a str, sealed: &'a [SealedGeneration]) -> Binding<'a> {
        Binding {
            predecessor: &self.predecessor,
            namespace,
            root_archive_bytes: if sealed.is_empty() { None } else { self.root_archive_bytes },
            sealed,
        }
    }

    pub(super) fn validate(&self) -> Result<()> {
        if self.sealed.is_empty() != self.root_archive_bytes.is_none()
            || self.sealed.len() >= MAX_RETAINED_GENERATIONS
        {
            return Err(Error::Contract("invalid retained raster generation count"));
        }
        self.active_binding()?;
        for (index, generation) in self.sealed.iter().enumerate() {
            if generation.archive.assets == 0
                || generation.archive.binding
                    != self.binding(&generation.namespace, &self.sealed[..index]).active()?
            {
                return Err(Error::Contract("retained raster generation lineage differs"));
            }
        }
        Ok(())
    }

    pub(super) fn sections(&self, bytes: u64) -> Result<Vec<(&AssetBackupIdentity, u64)>> {
        let root = self.root_archive_bytes.unwrap_or(bytes);
        let mut total = 0;
        let mut sections = Vec::with_capacity(self.sealed.len() + 1);
        for (identity, length) in std::iter::once((&self.predecessor, root)).chain(
            self.sealed.iter().map(|generation| (&generation.archive, generation.archive_bytes)),
        ) {
            if length == 0 || length > MAX_SERVER_ASSET_BACKUP_BYTES || length > bytes - total {
                return Err(Error::Contract("retained raster archive section bounds"));
            }
            total += length;
            sections.push((identity, length));
        }
        if total != bytes {
            return Err(Error::Contract("retained raster archive has trailing bytes"));
        }
        Ok(sections)
    }

    pub(super) fn next(
        &self,
        root_bytes: u64,
        active: &AssetBackupIdentity,
        active_bytes: u64,
    ) -> Result<Self> {
        self.check_rollover(active)?;
        let mut result = self.clone();
        result.sealed.push(SealedGeneration {
            namespace: self.namespace.clone(),
            archive: active.clone(),
            archive_bytes: active_bytes,
        });
        result.root_archive_bytes = Some(root_bytes);
        result.namespace = credentials::issue()?;
        result.validate()?;
        Ok(result)
    }

    pub(super) fn check_rollover(&self, active: &AssetBackupIdentity) -> Result<()> {
        if self.sealed.len() + 1 >= MAX_RETAINED_GENERATIONS {
            return Err(Error::Contract("retained raster generation limit"));
        }
        if active.assets == 0 {
            return Err(Error::Contract("cannot seal an empty raster generation"));
        }
        Ok(())
    }

    #[cfg(feature = "server")]
    pub(super) fn check_rollover_from(
        &self,
        previous: &Self,
        root_bytes: u64,
        active: &AssetBackupIdentity,
        active_bytes: u64,
    ) -> Result<()> {
        self.validate()?;
        let (last, prefix) =
            self.sealed.split_last().ok_or(Error::Contract("raster rollover seal missing"))?;
        if self.predecessor != previous.predecessor
            || self.root_archive_bytes != Some(root_bytes)
            || prefix != previous.sealed
            || last.namespace != previous.namespace
            || last.archive != *active
            || last.archive_bytes != active_bytes
            || self.namespace == previous.namespace
        {
            return Err(Error::Contract("retained raster rollover cut differs"));
        }
        Ok(())
    }
}
