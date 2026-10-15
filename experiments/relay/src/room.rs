//! Serialized room authority. Each account/ownership/edit transition appends durably before
//! in-memory publication; ephemeral leases never enter the portable editor checkpoint.
use crate::{
    Admission, DurableReceipt, Error, Lease, Recovery, Registration, Result, Role, access,
    credentials,
    log::{Event, Log, Record},
    protocol::Receipt,
};
use breditor_collab_feasibility::rich_replica::{
    RichReplica, SharedRichProfile, WriterGroupPreparation,
};
use std::{collections::BTreeMap, path::Path};

const MAX_WRITERS: usize = 1024;
const MAX_PRINCIPALS: usize = 1024;
struct Writer {
    principal: String,
    resume_hash: [u8; 32],
}

/// Exclusively locked durable rich room. Supply only server-authenticated principal identifiers.
///
/// The file lock prevents two processes from owning the same room. A network adapter must also
/// serialize calls on this value, including permission changes, lease resume and edit admission.
/// Open the log on a local filesystem with working file locks and sync semantics; do not unlink
/// or replace a live log. It is private service state, not an interchangeable document export.
pub struct Room {
    log: Log,
    profile: SharedRichProfile,
    replica: RichReplica,
    owner: String,
    asset_binding: String,
    roles: BTreeMap<String, Role>,
    writers: BTreeMap<String, Writer>,
    leases: BTreeMap<String, String>,
    receipts: BTreeMap<(String, String, String), DurableReceipt>,
}

impl Room {
    /// Create a never-overwritten room log in an existing host-owned directory.
    /// # Errors
    /// Rejects invalid initial content/configuration/account, existing files and persistence failure.
    pub fn create(path: &Path, configuration: &str, document: &str, owner: &str) -> Result<Self> {
        access::principal(owner)?;
        let profile = SharedRichProfile::from_configuration_json(configuration)?;
        let replica = profile.create(document, "1".into())?;
        let journal = replica.checkpoint()?;
        let asset_binding =
            Self::bind_assets(configuration, replica.document_id(), owner, &journal)?;
        let log = Log::create(
            path,
            Event::Seed {
                configuration: configuration.into(),
                room: replica.document_id().into(),
                owner: owner.into(),
                journal,
            },
        )?;
        Ok(Self {
            log,
            profile,
            replica,
            owner: owner.into(),
            asset_binding,
            roles: BTreeMap::new(),
            writers: BTreeMap::new(),
            leases: BTreeMap::new(),
            receipts: BTreeMap::new(),
        })
    }

    /// Acquire the file lock and replay every complete durable record through native admission.
    /// Old connections have no lease after restart. A torn final record is truncated only after
    /// all complete records pass integrity, ownership, permission and semantic replay checks.
    /// # Errors
    /// Rejects competing ownership, incompatible/corrupt state, invalid replay and I/O failure.
    pub fn open(path: &Path) -> Result<(Self, Recovery)> {
        let (log, mut records, recovery) = Log::open(path)?;
        let seed = records.remove(0);
        let Event::Seed { configuration, room, owner, journal } = seed.event else {
            return Err(Error::Contract("first relay record must seed room"));
        };
        access::principal(&owner)?;
        let asset_binding = Self::bind_assets(&configuration, &room, &owner, &journal)?;
        let profile = SharedRichProfile::from_configuration_json(&configuration)?;
        let replica = profile.restore(&room, &journal)?;
        if replica.writer() != "1" || replica.undo_count() != 0 || replica.redo_count() != 0 {
            return Err(Error::Contract("relay seed writer or history"));
        }
        let mut result = Self {
            log,
            profile,
            replica,
            owner,
            asset_binding,
            roles: BTreeMap::new(),
            writers: BTreeMap::new(),
            leases: BTreeMap::new(),
            receipts: BTreeMap::new(),
        };
        for record in records {
            result.replay(record)?;
        }
        result.log.finish_recovery(recovery)?;
        Ok((result, recovery))
    }

    fn replay(&mut self, record: Record) -> Result<()> {
        match record.event {
            Event::Seed { .. } => return Err(Error::Contract("duplicate relay seed")),
            Event::Grant { actor, principal, role } => {
                self.check_grant(&actor, &principal, role)?;
                self.apply_grant(principal, role);
            }
            Event::Register { principal, writer, resume_hash } => {
                self.editor(&principal)?;
                if self.next_writer()? != writer {
                    return Err(Error::Contract("writer allocation lineage"));
                }
                self.writers.insert(writer, Writer { principal, resume_hash });
            }
            Event::Commit { principal, writer, frame, receipt } => {
                self.owns(&principal, &writer)?;
                let WriterGroupPreparation::Prepared(prepared) =
                    self.replica.prepare_writer_group(&writer, &frame)?
                else {
                    return Err(Error::Contract("durable group did not prepare"));
                };
                if Receipt::from(prepared.receipt().clone()) != receipt {
                    return Err(Error::Contract("durable receipt replay differs"));
                }
                self.replica.commit_writer_group(*prepared)?;
                self.remember(record.sequence, receipt);
            }
        }
        Ok(())
    }

    pub(crate) fn reader(&self, principal: &str) -> Result<()> {
        self.log.ready()?;
        access::principal(principal)?;
        if principal == self.owner || self.roles.contains_key(principal) {
            Ok(())
        } else {
            Err(Error::Permission)
        }
    }
    pub(crate) fn editor(&self, principal: &str) -> Result<()> {
        self.reader(principal)?;
        if principal == self.owner || self.roles.get(principal) == Some(&Role::Editor) {
            Ok(())
        } else {
            Err(Error::Permission)
        }
    }

    fn bind_assets(configuration: &str, room: &str, owner: &str, journal: &str) -> Result<String> {
        Ok(crate::assets::asset_id(&serde_json::to_vec(&(
            "breditor/room-asset-binding/1",
            configuration,
            room,
            owner,
            journal,
        ))?))
    }
    /// Immutable seed/authority identity for a separate asset store. This is not a credential.
    #[must_use]
    pub fn asset_binding(&self) -> &str {
        &self.asset_binding
    }

    /// Persist separately admitted bytes under current editor permission. Does not append a
    /// document action or change history. The caller serializes this with role changes.
    /// # Errors
    /// Rejects missing write permission, wrong store binding and storage errors.
    pub fn put_asset(
        &self,
        principal: &str,
        store: &mut crate::assets::AssetStore,
        asset: crate::assets::PreparedAsset,
    ) -> Result<crate::assets::AssetReceipt> {
        self.editor(principal)?;
        if store.binding() != self.asset_binding {
            return Err(Error::Contract("asset store room binding"));
        }
        store.put(asset)
    }
    /// Read verified bytes under current reader permission, independently of document history.
    /// Revocation prevents future reads; it cannot erase a reader's already cached offline bytes.
    /// # Errors
    /// Rejects missing read permission, wrong store binding and storage corruption/failure.
    pub fn read_asset(
        &self,
        principal: &str,
        store: &crate::assets::AssetStore,
        asset: &str,
    ) -> Result<Option<crate::assets::StoredAsset>> {
        self.reader(principal)?;
        if store.binding() != self.asset_binding {
            return Err(Error::Contract("asset store room binding"));
        }
        store.get(asset)
    }
    fn owns(&self, principal: &str, writer: &str) -> Result<()> {
        self.editor(principal)?;
        if self.writers.get(writer).is_some_and(|w| w.principal == principal) {
            Ok(())
        } else {
            Err(Error::Lease)
        }
    }
    fn check_grant(&self, actor: &str, principal: &str, role: Option<Role>) -> Result<()> {
        self.log.ready()?;
        if actor != self.owner {
            return Err(Error::Permission);
        }
        access::principal(principal)?;
        if principal == self.owner {
            return Err(Error::Contract("initial owner is immutable"));
        }
        if role.is_some()
            && !self.roles.contains_key(principal)
            && self.roles.len() >= MAX_PRINCIPALS
        {
            return Err(Error::Contract("room account budget"));
        }
        Ok(())
    }
    fn apply_grant(&mut self, principal: String, role: Option<Role>) {
        // Permission changes and admission are in the same room serialization domain. Even a
        // later regrant requires a new resume; no stale socket silently regains write authority.
        self.leases.retain(|id, _| self.writers.get(id).is_none_or(|w| w.principal != principal));
        if let Some(role) = role {
            self.roles.insert(principal, role);
        } else {
            self.roles.remove(&principal);
        }
    }

    /// Persist an owner-authorized role change (or revocation) and fence this account's old leases.
    /// # Errors
    /// Rejects non-owner administration, invalid/bounded accounts and uncertain storage.
    pub fn grant(&mut self, actor: &str, principal: &str, role: Option<Role>) -> Result<()> {
        self.check_grant(actor, principal, role)?;
        self.log.append(Event::Grant { actor: actor.into(), principal: principal.into(), role })?;
        self.apply_grant(principal.into(), role);
        Ok(())
    }
    fn next_writer(&self) -> Result<String> {
        if self.writers.len() >= MAX_WRITERS {
            return Err(Error::Contract("room writer budget"));
        }
        // Server owns 1. Allocations are contiguous, never recycled after revocation or restart.
        Ok((u64::try_from(self.writers.len())
            .map_err(|_| Error::Contract("room writer budget"))?
            + 2)
        .to_string())
    }

    /// Allocate a distinct causal writer and persist principal/hashed-credential ownership before
    /// returning its secret. Do not author until the browser has saved this separate credential.
    /// # Errors
    /// Rejects missing write permission, allocation budget, entropy and persistence failures.
    pub fn register(&mut self, principal: &str) -> Result<Registration> {
        self.editor(principal)?;
        let writer = self.next_writer()?;
        let credential = credentials::issue()?;
        let resume_hash = credentials::hash(&credential)?;
        let token = credentials::issue()?;
        self.log.append(Event::Register {
            principal: principal.into(),
            writer: writer.clone(),
            resume_hash,
        })?;
        self.writers.insert(writer.clone(), Writer { principal: principal.into(), resume_hash });
        self.leases.insert(writer.clone(), token.clone());
        Ok(Registration { lease: Lease { writer, token }, credential })
    }

    /// Reacquire the same writer with its separate account-bound credential. Replaces every old
    /// connection fence, including a concurrent tab's fence. Does not clear or rewrite local work.
    /// # Errors
    /// Rejects wrong account/credential, revoked/reader permissions, entropy or storage recovery.
    pub fn resume(&mut self, principal: &str, writer: &str, credential: &str) -> Result<Lease> {
        self.owns(principal, writer)?;
        let record = self.writers.get(writer).ok_or(Error::Lease)?;
        if credentials::hash(credential)? != record.resume_hash {
            return Err(Error::Lease);
        }
        let token = credentials::issue()?;
        self.leases.insert(writer.into(), token.clone());
        Ok(Lease { writer: writer.into(), token })
    }

    /// Check that this authenticated writer session still owns its connection fence before
    /// sending author-sensitive catchup as well as before accepting writes.
    /// # Errors
    /// Rejects revoked permissions, foreign ownership, replaced fences or uncertain storage.
    pub fn validate_lease(&self, principal: &str, lease: &Lease) -> Result<()> {
        self.owns(principal, &lease.writer)?;
        if self.leases.get(&lease.writer) == Some(&lease.token) {
            Ok(())
        } else {
            Err(Error::Lease)
        }
    }
    /// Release this connection only if it still owns the active fence. Old disconnect callbacks
    /// cannot clear a newer resumed connection. No credential or authored history is deleted.
    pub fn release(&mut self, lease: &Lease) {
        if self.leases.get(&lease.writer) == Some(&lease.token) {
            self.leases.remove(&lease.writer);
        }
    }

    /// Read a trusted full-state catchup under current account permissions. Clients must not use
    /// this multi-author format as their authenticated outbound edit submission.
    /// # Errors
    /// Rejects missing read permission, uncertain storage or existing core frame budgets.
    pub fn catchup(&self, principal: &str) -> Result<String> {
        self.reader(principal)?;
        Ok(self.replica.update_frame()?)
    }
    /// Read the exact profile contract after authentication, without granting writer ownership.
    /// # Errors
    /// Rejects missing read permission or uncertain storage.
    pub fn descriptor(&self, principal: &str) -> Result<String> {
        self.reader(principal)?;
        Ok(self.profile.descriptor_json())
    }
    /// Read applied author progress and canonical lineage for resumable outbound group cursors.
    /// # Errors
    /// Rejects missing read permission, uncertain storage or invalid writer identity.
    pub fn writer_clock(&self, principal: &str, writer: &str) -> Result<serde_json::Value> {
        self.reader(principal)?;
        Ok(serde_json::to_value(self.replica.writer_clock(writer)?)?)
    }
    fn key(receipt: &Receipt) -> (String, String, String) {
        (receipt.writer.clone(), receipt.from.clone(), receipt.through.clone())
    }
    fn remember(&mut self, sequence: u64, receipt: Receipt) -> DurableReceipt {
        let ack = DurableReceipt { sequence: sequence.to_string(), receipt, duplicate: false };
        self.receipts.insert(Self::key(&ack.receipt), ack.clone());
        ack
    }

    /// Admit exactly one authenticated active writer's atomic group, append+sync the acceptance
    /// record, then publish the already-admitted candidate and return a server-durable receipt.
    ///
    /// Missing dependencies remain client-owned pending work. An exact retry returns the ORIGINAL
    /// durable sequence, even after restart or different binary packing; it appends nothing.
    /// # Errors
    /// Rejects revoked/stale/foreign authority, malformed/forked/invalid groups, bounded history,
    /// uncertain storage or I/O failure. No acknowledgement is issued on an uncertain append.
    pub fn admit(&mut self, principal: &str, lease: &Lease, frame: &str) -> Result<Admission> {
        self.validate_lease(principal, lease)?;
        match self.replica.prepare_writer_group(&lease.writer, frame)? {
            WriterGroupPreparation::Pending { writer, missing } => {
                Ok(Admission::Pending { writer, missing })
            }
            WriterGroupPreparation::Duplicate(receipt) => {
                let receipt = Receipt::from(receipt);
                let mut ack = self
                    .receipts
                    .get(&Self::key(&receipt))
                    .ok_or(Error::Contract("duplicate has no durable receipt"))?
                    .clone();
                if ack.receipt != receipt {
                    return Err(Error::Contract("duplicate durable receipt differs"));
                }
                ack.duplicate = true;
                Ok(Admission::Durable(ack))
            }
            WriterGroupPreparation::Prepared(prepared) => {
                // Prove that exact recovery remains inside the native journal budget before I/O.
                prepared.checkpoint()?;
                let receipt = Receipt::from(prepared.receipt().clone());
                let sequence = self.log.append(Event::Commit {
                    principal: principal.into(),
                    writer: lease.writer.clone(),
                    frame: frame.into(),
                    receipt: receipt.clone(),
                })?;
                if let Err(error) = self.replica.commit_writer_group(*prepared) {
                    self.log.invalidate();
                    return Err(error.into());
                }
                Ok(Admission::Durable(self.remember(sequence, receipt)))
            }
        }
    }
}
