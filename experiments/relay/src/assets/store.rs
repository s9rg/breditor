//! Exclusively locked immutable files. A synced final hard link publishes one complete asset;
//! uncertainty fences writes until reopen. No asset deletion is inferred from document state.
use super::{AssetInfo, AssetReceipt, PreparedAsset, StoredAsset, record, types::key};
use crate::{Error, Result, credentials};
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    fs::{self, DirBuilder, File, OpenOptions, TryLockError},
    io::{Read, Write},
    path::{Path, PathBuf},
};

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Manifest {
    format: String,
    format_version: u32,
    binding: String,
}

/// Private directory bound to one immutable room seed/authority, not an account credential.
pub struct AssetStore {
    root: PathBuf,
    binding: String,
    _lock: File,
    entries: BTreeMap<String, AssetInfo>,
    bytes: u64,
    poisoned: bool,
}
fn private_options() -> OpenOptions {
    let mut o = OpenOptions::new();
    o.read(true).write(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        o.mode(0o600);
    }
    o
}
fn sync_directory(root: &Path) -> Result<()> {
    File::open(root)?.sync_all()?;
    Ok(())
}
fn pending(name: &str) -> bool {
    name.strip_prefix(".pending-").is_some_and(|s| {
        s.len() == 64 && s.bytes().all(|v| v.is_ascii_digit() || (b'a'..=b'f').contains(&v))
    })
}
fn initialize_manifest(root: &Path, binding: &str) -> Result<PathBuf> {
    let path = root.join("store.json");
    if !path.exists() {
        if fs::read_dir(root)?
            .any(|entry| entry.is_err() || entry.is_ok_and(|e| e.file_name() != ".lock"))
        {
            return Err(Error::Contract("asset store has no complete manifest"));
        }
        let manifest = Manifest {
            format: "breditor/relay-asset-store".into(),
            format_version: 1,
            binding: binding.into(),
        };
        let mut file = private_options().create_new(true).open(&path)?;
        file.write_all(&serde_json::to_vec(&manifest)?)?;
        file.sync_all()?;
        sync_directory(root)?;
        sync_directory(
            root.parent().filter(|p| !p.as_os_str().is_empty()).unwrap_or(Path::new(".")),
        )?;
    }
    Ok(path)
}
impl AssetStore {
    /// Open or initialize an empty host-owned directory. Existing manifests/complete files never
    /// get overwritten. Only recognized uncommitted staging files are removed after validation.
    /// # Errors
    /// Rejects wrong room binding, concurrent owners, corrupt/unknown files, budgets and I/O errors.
    pub fn open(root: &Path, binding: &str) -> Result<Self> {
        key(binding)?;
        let mut builder = DirBuilder::new();
        #[cfg(unix)]
        {
            use std::os::unix::fs::DirBuilderExt;
            builder.mode(0o700);
        }
        match builder.create(root) {
            Ok(()) => {}
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {}
            Err(e) => return Err(e.into()),
        }
        if !fs::symlink_metadata(root)?.is_dir() {
            return Err(Error::Contract("private asset directory required"));
        }
        let lock = private_options().create(true).truncate(false).open(root.join(".lock"))?;
        lock.try_lock().map_err(|e| match e {
            TryLockError::WouldBlock => Error::Locked,
            TryLockError::Error(e) => Error::Io(e),
        })?;
        let manifest_path = initialize_manifest(root, binding)?;
        if !fs::symlink_metadata(&manifest_path)?.is_file() {
            return Err(Error::Contract("asset manifest file"));
        }
        let mut json = String::new();
        File::open(&manifest_path)?.take(4097).read_to_string(&mut json)?;
        if json.len() > 4096 {
            return Err(Error::Contract("asset manifest bytes"));
        }
        let manifest: Manifest = serde_json::from_str(&json)?;
        if manifest.format != "breditor/relay-asset-store"
            || manifest.format_version != 1
            || manifest.binding != binding
        {
            return Err(Error::Contract("asset store room binding"));
        }
        let mut entries = BTreeMap::new();
        let mut bytes = 0_u64;
        let mut garbage = Vec::new();
        let mut count = 0;
        for entry in fs::read_dir(root)? {
            count += 1;
            if count > super::MAX_ASSETS * 2 + 2 {
                return Err(Error::Contract("asset directory entry budget"));
            }
            let entry = entry?;
            let name =
                entry.file_name().into_string().map_err(|_| Error::Contract("asset file name"))?;
            if name == ".lock" || name == "store.json" {
                continue;
            }
            if !entry.file_type()?.is_file() {
                return Err(Error::Contract("asset directory entry type"));
            }
            if pending(&name) {
                garbage.push(entry.path());
                continue;
            }
            let hex =
                name.strip_suffix(".asset").ok_or(Error::Contract("unknown asset store file"))?;
            let asset = format!("sha256:{hex}");
            key(&asset)?;
            let stored = record::read(&entry.path(), &asset)?;
            bytes += stored.info.bytes;
            if bytes > super::MAX_STORED_BYTES || entries.len() >= super::MAX_ASSETS {
                return Err(Error::Contract("asset store budget"));
            }
            entries.insert(asset, stored.info);
        }
        for path in &garbage {
            fs::remove_file(path)?;
        }
        if !garbage.is_empty() {
            sync_directory(root)?;
        }
        Ok(Self {
            root: root.into(),
            binding: binding.into(),
            _lock: lock,
            entries,
            bytes,
            poisoned: false,
        })
    }
    /// Immutable room binding, not a substitute for account/role authentication.
    #[must_use]
    pub fn binding(&self) -> &str {
        &self.binding
    }
    /// Number of complete immutable stored assets, excluding staging work.
    #[must_use]
    pub fn count(&self) -> usize {
        self.entries.len()
    }
    /// Encoded bytes retained for history/offline references.
    #[must_use]
    pub const fn stored_bytes(&self) -> u64 {
        self.bytes
    }
    fn ready(&self) -> Result<()> {
        if self.poisoned { Err(Error::NeedsRecovery) } else { Ok(()) }
    }
    /// Revalidate bytes on read. A missing key is distinct from corrupt known storage.
    /// # Errors
    /// Rejects wrong key, uncertain writes, corruption or I/O failure without altering files.
    pub fn get(&self, asset: &str) -> Result<Option<StoredAsset>> {
        self.ready()?;
        let hex = key(asset)?;
        let Some(info) = self.entries.get(asset) else {
            return Ok(None);
        };
        let stored = record::read(&self.root.join(format!("{hex}.asset")), asset)?;
        if &stored.info != info {
            return Err(Error::Contract("immutable asset metadata changed"));
        }
        Ok(Some(stored))
    }
    /// Sync one admitted asset before acknowledgement. Exact retries validate existing bytes and
    /// do not spend the budget again. Unreferenced complete assets are retained, not collected.
    /// # Errors
    /// Rejects budgets, inconsistent existing storage and uncertain I/O. Reopen after any write
    /// uncertainty; a complete published file may already exist even if no receipt was returned.
    pub fn put(&mut self, prepared: PreparedAsset) -> Result<AssetReceipt> {
        self.ready()?;
        if let Some(existing) = self.get(&prepared.info.asset)? {
            if existing.info != prepared.info {
                return Err(Error::Contract("immutable asset metadata conflict"));
            }
            return Ok(AssetReceipt::new(existing.info, true));
        }
        if self.entries.len() >= super::MAX_ASSETS
            || self.bytes + prepared.info.bytes > super::MAX_STORED_BYTES
        {
            return Err(Error::Contract("asset store budget"));
        }
        let staging = self.root.join(format!(".pending-{}", credentials::issue()?));
        let final_path = self.root.join(format!("{}.asset", key(&prepared.info.asset)?));
        self.poisoned = true;
        record::write(&staging, &prepared)?;
        fs::hard_link(&staging, &final_path)?;
        sync_directory(&self.root)?;
        fs::remove_file(&staging)?;
        sync_directory(&self.root)?;
        self.poisoned = false;
        self.bytes += prepared.info.bytes;
        self.entries.insert(prepared.info.asset.clone(), prepared.info.clone());
        Ok(AssetReceipt::new(prepared.info, false))
    }
}
