//! Explicit storage reserve requests for one native history lane at a time.
use super::{ServerNativeHistoryCapacity, ServerNativeHistoryLane, ServerNativeHistoryPlan};
use crate::{Error, Result, RoomBackupIdentity};
use breditor_collab_feasibility::{NativeHistoryUsage, rich_replica::DocumentHistoryCapacity};
use serde::{Deserialize, Serialize};

/// Minimum unused units required in every named resource. Zero omits a resource.
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase", deny_unknown_fields)]
pub struct ServerNativeHistoryReserve {
    /// Unused entries in each active document file, or events in the active review file.
    pub active_inputs: usize,
    /// Unused canonical bytes in each active file.
    pub active_bytes: usize,
    /// Unused canonical bytes in each complete native checkpoint.
    pub checkpoint_bytes: usize,
    /// Unused generation file slots. Original history has no slots.
    pub generation_files: usize,
    /// Unused retained event allowance across the whole review archive. Review only.
    pub retained_review_events: usize,
    /// Unused slots in the room-wide native boundary receipt index.
    pub boundary_records: usize,
}

/// Select the lane, proposed IDs and resources for a one-boundary preview.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ServerNativeHistoryReserveRequest {
    /// Native lane to measure. The document request also covers the private effect author.
    pub lane: ServerNativeHistoryLane,
    /// Lifetime-new native generation ID to use if a boundary is staged.
    pub next: String,
    /// Exact original root ID. Required to consider enabling generations on an original lane.
    pub original_root: Option<String>,
    /// Explicit floors. At least one resource must have a nonzero floor.
    pub reserve: ServerNativeHistoryReserve,
}

/// One authenticated observation or a plan that meets all requested floors at its selected cut.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ServerNativeHistoryReserveOutcome {
    /// Current usage meets the request. No boundary is needed.
    Sufficient {
        /// Exact durable room cut.
        source: RoomBackupIdentity,
        /// Measured usage at this cut.
        capacity: Box<ServerNativeHistoryCapacity>,
    },
    /// A staged boundary meets the request and its WAL append passes preflight.
    Boundary {
        /// Use the enclosed selection for guarded apply.
        plan: Box<ServerNativeHistoryPlan>,
    },
    /// No single native boundary considered at this cut meets the request.
    Unavailable {
        /// Exact durable room cut.
        source: RoomBackupIdentity,
        /// Measured usage at this cut.
        capacity: Box<ServerNativeHistoryCapacity>,
    },
}

fn meets(usage: NativeHistoryUsage, floor: usize) -> bool {
    usage.limit.saturating_sub(usage.used) >= floor
}

impl ServerNativeHistoryReserve {
    pub(super) fn validate(self, lane: ServerNativeHistoryLane) -> Result<()> {
        if self == Self::default() {
            return Err(Error::Contract("native history reserve is empty"));
        }
        if lane == ServerNativeHistoryLane::Document && self.retained_review_events != 0 {
            return Err(Error::Contract("retained review reserve requires the review lane"));
        }
        Ok(())
    }

    pub(super) fn fits(
        self,
        lane: ServerNativeHistoryLane,
        capacity: &ServerNativeHistoryCapacity,
    ) -> bool {
        if !meets(capacity.boundary_records, self.boundary_records) {
            return false;
        }
        match lane {
            ServerNativeHistoryLane::Document => {
                self.fits_document(capacity.document.capacity)
                    && capacity
                        .suggestion_effect
                        .is_none_or(|effect| self.fits_document(effect.capacity))
            }
            ServerNativeHistoryLane::Review => capacity.review.is_some_and(|review| {
                let review = review.capacity;
                meets(review.retained_events, self.retained_review_events)
                    && self.fits_owner(
                        review.active_events,
                        review.active_bytes,
                        review.checkpoint_bytes,
                        review.generation_files,
                    )
            }),
        }
    }

    fn fits_document(self, document: DocumentHistoryCapacity) -> bool {
        self.fits_owner(
            document.active_entries,
            document.active_bytes,
            document.checkpoint_bytes,
            document.generation_files,
        )
    }

    fn fits_owner(
        self,
        active_inputs: NativeHistoryUsage,
        active_bytes: NativeHistoryUsage,
        checkpoint_bytes: NativeHistoryUsage,
        generation_files: Option<NativeHistoryUsage>,
    ) -> bool {
        meets(active_inputs, self.active_inputs)
            && meets(active_bytes, self.active_bytes)
            && meets(checkpoint_bytes, self.checkpoint_bytes)
            && (self.generation_files == 0
                || generation_files.is_some_and(|files| meets(files, self.generation_files)))
    }

    pub(super) fn can_seal(
        self,
        lane: ServerNativeHistoryLane,
        capacity: &ServerNativeHistoryCapacity,
    ) -> bool {
        let has_slot = |files: Option<NativeHistoryUsage>| {
            files
                .is_some_and(|files| files.limit.saturating_sub(files.used) > self.generation_files)
        };
        match lane {
            ServerNativeHistoryLane::Document => {
                let document = capacity.document.capacity;
                document.active_entries.used != 0
                    && has_slot(document.generation_files)
                    && capacity.suggestion_effect.is_none_or(|effect| {
                        let effect = effect.capacity;
                        // A seal leaves the idle private author's active file in place.
                        effect.active_entries.used == 0 || has_slot(effect.generation_files)
                    })
            }
            ServerNativeHistoryLane::Review => capacity.review.is_some_and(|review| {
                review.capacity.active_events.used != 0
                    && has_slot(review.capacity.generation_files)
            }),
        }
    }
}
