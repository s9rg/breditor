//! Reserve non-authoring document identities for comment-only/read-only clients.
use super::{Room, Writer};
use crate::{Error, Lease, Registration, Result, credentials, log::Event};

impl Room {
    /// Reserve a document writer for observation only. The allocation shares the ordinary
    /// registry so future editor allocations cannot collide with a reader's native identity.
    /// Promotion of the account NEVER promotes this identity into a document author.
    /// # Errors
    /// Rejects missing read permission, allocation budgets, entropy and storage failures.
    pub fn register_observer(&mut self, principal: &str) -> Result<Registration> {
        self.reader(principal)?;
        self.check_principal_writer_budget(principal)?;
        let writer = self.next_writer()?;
        let credential = credentials::issue()?;
        let resume_hash = credentials::hash(&credential)?;
        let token = credentials::issue()?;
        self.log.append(Event::RegisterObserverV1 {
            principal: principal.into(),
            writer: writer.clone(),
            resume_hash,
        })?;
        self.writers.insert(
            writer.clone(),
            Writer { principal: principal.into(), resume_hash, observer: true },
        );
        self.leases.insert(writer.clone(), token.clone());
        Ok(Registration { lease: Lease { writer, token }, credential })
    }

    pub(super) fn replay_observer(
        &mut self,
        principal: String,
        writer: String,
        resume_hash: [u8; 32],
    ) -> Result<()> {
        self.reader(&principal)?;
        if self.next_writer()? != writer {
            return Err(Error::Contract("observer allocation lineage"));
        }
        self.writers.insert(writer, Writer { principal, resume_hash, observer: true });
        Ok(())
    }

    fn owns_observer(&self, principal: &str, writer: &str) -> Result<()> {
        self.reader(principal)?;
        if self.writers.get(writer).is_some_and(|w| w.principal == principal && w.observer) {
            Ok(())
        } else {
            Err(Error::Lease)
        }
    }

    /// Resume a reserved observation identity without granting document-edit permission.
    /// # Errors
    /// Rejects foreign, editor-kind or revoked identities, bad secrets and unavailable storage.
    pub fn resume_observer(
        &mut self,
        principal: &str,
        writer: &str,
        credential: &str,
    ) -> Result<Lease> {
        self.owns_observer(principal, writer)?;
        if self.writers.get(writer).ok_or(Error::Lease)?.resume_hash
            != credentials::hash(credential)?
        {
            return Err(Error::Lease);
        }
        let token = credentials::issue()?;
        self.leases.insert(writer.into(), token.clone());
        Ok(Lease { writer: writer.into(), token })
    }

    /// Validate only an observation lease. Ordinary edit admission never accepts this capability.
    /// # Errors
    /// Rejects replaced leases, missing read rights and every editor-kind identity.
    pub fn validate_observer_lease(&self, principal: &str, lease: &Lease) -> Result<()> {
        self.owns_observer(principal, &lease.writer)?;
        if self.leases.get(&lease.writer) == Some(&lease.token) {
            Ok(())
        } else {
            Err(Error::Lease)
        }
    }
}
