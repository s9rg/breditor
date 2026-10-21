//! Private protected-input matching shared only after actual selected native inventory checks.
use super::{
    MissingRecoveryRegistration, RecoveryRegistrationCredentials, RoomParticipantInventoryMetadata,
};
use crate::{Error, Result, Room, credentials};
use std::collections::BTreeSet;

impl Room {
    // This returns no capability. Each public family verifies its actual native selection first
    // and constructs only its own non-deserializable, cut-bound proof after complete matching.
    pub(in crate::room) fn missing_recovery_registrations(
        &self,
        metadata: &RoomParticipantInventoryMetadata,
        supplied: &RecoveryRegistrationCredentials,
    ) -> Result<Vec<MissingRecoveryRegistration>> {
        self.log.ready()?;
        let review_writers = metadata.review.as_ref().map_or(0, |r| r.writers.len());
        if supplied.documents.len() > metadata.writers.len()
            || supplied.reviews.len() > review_writers
        {
            return Err(Error::Lease);
        }
        let mut documents = BTreeSet::new();
        for record in &supplied.documents {
            if !documents.insert(record.writer.as_str()) {
                return Err(Error::Lease);
            }
            let registered = self.writers.get(&record.writer).ok_or(Error::Lease)?;
            if registered.principal != record.principal
                || registered.resume_hash != credentials::hash(&record.credential)?
            {
                return Err(Error::Lease);
            }
        }
        let mut reviews = BTreeSet::new();
        for record in &supplied.reviews {
            if !reviews.insert(record.actor.as_str()) {
                return Err(Error::Lease);
            }
            self.check_recovery_review_credential(
                &record.principal,
                &record.actor,
                &record.credential,
            )?;
        }
        let mut missing = Vec::new();
        for registered in &metadata.writers {
            if !documents.contains(registered.clock.writer.as_str()) {
                missing.push(MissingRecoveryRegistration::Document {
                    principal: registered.principal.clone(),
                    writer: registered.clock.writer.clone(),
                });
            }
        }
        if let Some(review) = &metadata.review {
            for registered in &review.writers {
                if !reviews.contains(registered.clock.actor.as_str()) {
                    missing.push(MissingRecoveryRegistration::Review {
                        principal: registered.principal.clone(),
                        actor: registered.clock.actor.as_str().into(),
                    });
                }
            }
        }
        self.log.ready()?;
        Ok(missing)
    }
}
