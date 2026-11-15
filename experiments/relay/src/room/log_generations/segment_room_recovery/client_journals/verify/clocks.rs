//! Shared accepted-prefix checks for strict restore and side-by-side branch inspection.
use super::{super::branches::RelaySegmentBranchClock, position};
use crate::{Error, RecoveryDocumentClock, RecoveryReviewRegistration, Result, Room};
use breditor_collab_feasibility::{
    review::{ReviewPrincipalId, ReviewSession},
    rich_replica::RichReplica,
};
use std::collections::BTreeMap;

pub(in super::super) fn compare_document(
    room: &Room,
    local: &RichReplica,
    accepted: &BTreeMap<&str, &RecoveryDocumentClock>,
    own: &RecoveryDocumentClock,
    observer: bool,
    inspect_owned_fork: bool,
) -> Result<RelaySegmentBranchClock> {
    let head = if room.atomic_transport_v2 {
        RichReplica::writer_clock_v2
    } else {
        RichReplica::writer_clock
    };
    let at = if room.atomic_transport_v2 {
        RichReplica::writer_clock_at_v2
    } else {
        RichReplica::writer_clock_at
    };
    let mut authors = local.applied_writer_ids();
    // A joined journal has the exact immutable seed even if its expected writer has never edited.
    if !authors.iter().any(|writer| writer == "1") {
        return Err(Error::Contract("client journal is missing document genesis"));
    }
    if !authors.contains(&own.writer) {
        authors.push(own.writer.clone());
    }
    let mut owned = None;
    for writer in authors {
        let server = accepted
            .get(writer.as_str())
            .ok_or(Error::Contract("client journal has unregistered document author"))?;
        let client = head(local, &writer)?;
        let order = position(&client.through)?.cmp(&position(&server.through)?);
        if writer == "1" && !order.is_eq() {
            return Err(Error::Contract("client journal document genesis differs"));
        }
        if order.is_gt() && (writer != own.writer || observer) {
            return Err(Error::Contract("client journal has foreign document suffix"));
        }
        let same = match order {
            std::cmp::Ordering::Equal => client.prefix_digest == server.prefix_digest,
            std::cmp::Ordering::Less => {
                client.prefix_digest == at(&room.replica, &writer, &client.through)?.prefix_digest
            }
            std::cmp::Ordering::Greater => {
                at(local, &writer, &server.through)?.prefix_digest == server.prefix_digest
            }
        };
        let is_owner = writer == own.writer;
        if !same && (!is_owner || !inspect_owned_fork) {
            return Err(Error::Contract("client journal document prefix diverged"));
        }
        if is_owner {
            let compared_through =
                if order.is_gt() { server.through.clone() } else { client.through.clone() };
            owned = Some(RelaySegmentBranchClock {
                local_through: client.through,
                accepted_through: server.through.clone(),
                compared_through,
                prefix_matches: same,
            });
        }
    }
    owned.ok_or(Error::Contract("client journal document writer was not checked"))
}

pub(in super::super) fn compare_review(
    room: &Room,
    local: &ReviewSession,
    accepted: &BTreeMap<&str, &RecoveryReviewRegistration>,
    own: &RecoveryReviewRegistration,
    inspect_owned_fork: bool,
) -> Result<RelaySegmentBranchClock> {
    let server_review =
        &room.review.as_ref().ok_or(Error::Contract("room review is absent"))?.session;
    let mut actors = local.retained_actor_ids();
    if !actors.contains(&own.clock.actor) {
        actors.push(own.clock.actor.clone());
    }
    let mut owned = None;
    for actor in actors {
        let row = accepted
            .get(actor.as_str())
            .ok_or(Error::Contract("client journal has unregistered review actor"))?;
        let principal = ReviewPrincipalId::try_new(&row.principal)?;
        let client = local.writer_clock(&actor, &principal)?;
        let server = &row.clock;
        let local_end = position(&client.through)?;
        let accepted_end = position(&server.through)?;
        if local_end > accepted_end && (actor != own.clock.actor || own.observer) {
            return Err(Error::Contract("client journal has foreign review suffix"));
        }
        let common = local_end.min(accepted_end);
        let local_prefix = if common == local_end {
            client
        } else {
            local.writer_clock_at(&actor, &principal, common)?
        };
        let server_prefix = if common == accepted_end {
            server.prefix_digest.clone()
        } else {
            server_review.writer_clock_at(&actor, &principal, common)?.prefix_digest
        };
        let same = local_prefix.prefix_digest == server_prefix;
        let is_owner = actor == own.clock.actor;
        if !same && (!is_owner || !inspect_owned_fork) {
            return Err(Error::Contract("client journal review prefix diverged"));
        }
        if is_owner {
            owned = Some(RelaySegmentBranchClock {
                local_through: local_end.to_string(),
                accepted_through: server.through.clone(),
                compared_through: common.to_string(),
                prefix_matches: same,
            });
        }
    }
    owned.ok_or(Error::Contract("client journal review actor was not checked"))
}
