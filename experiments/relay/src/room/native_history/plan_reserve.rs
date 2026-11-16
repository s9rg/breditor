//! Choose one explicit boundary using actual admitted native projections, without writes.
use super::{
    NativeHistoryBoundary, ServerNativeHistoryFamily, ServerNativeHistoryLane,
    ServerNativeHistoryPlan, ServerNativeHistoryReserveOutcome, ServerNativeHistoryReserveRequest,
    plan::select_boundary,
};
use crate::{Error, Result, Room};
use breditor_collab_feasibility::{Error as NativeError, review::ReviewError};

impl Room {
    /// Report whether the selected lane meets the reserve or preview one boundary that will.
    /// Tries an ordinary seal before a continuation. Original lanes require an explicit root
    /// to consider enabling generations. Every proposed selection still needs guarded apply.
    /// # Errors
    /// Refuses unauthorized or invalid requests, a disabled review lane, uncertain custody,
    /// native identity or integrity failures, and WAL preflight failure on a fitting candidate.
    pub fn plan_native_history_reserve(
        &self,
        principal: &str,
        request: ServerNativeHistoryReserveRequest,
    ) -> Result<ServerNativeHistoryReserveOutcome> {
        self.recovery_inventory_owner(principal)?;
        let ServerNativeHistoryReserveRequest { lane, next, original_root, reserve } = request;
        reserve.validate(lane)?;
        let source = self.native_history_append_cut()?;
        let capacity = self.native_history_capacity(principal)?;
        let family = match lane {
            ServerNativeHistoryLane::Document => capacity.document.family,
            ServerNativeHistoryLane::Review => {
                capacity.review.ok_or(Error::Contract("review V1 not enabled"))?.family
            }
        };
        if reserve.fits(lane, &capacity) {
            self.check_native_history_append_cut(&source)?;
            return Ok(ServerNativeHistoryReserveOutcome::Sufficient {
                source,
                capacity: Box::new(capacity),
            });
        }

        let first = match family {
            ServerNativeHistoryFamily::Original => original_root
                .map(|root| NativeHistoryBoundary::Enable { root, active: next.clone() }),
            _ if reserve.can_seal(lane, &capacity) => {
                Some(NativeHistoryBoundary::Seal { next: next.clone() })
            }
            _ => None,
        };
        let continuation =
            (family == ServerNativeHistoryFamily::SegmentedV1).then_some(match lane {
                ServerNativeHistoryLane::Document => {
                    NativeHistoryBoundary::ContinueDocument { next }
                }
                ServerNativeHistoryLane::Review => NativeHistoryBoundary::ContinueReview { next },
            });

        for boundary in first.into_iter().chain(continuation) {
            let remaining_records = self
                .native_boundary_limit(Some(&boundary))
                .saturating_sub(capacity.boundary_records.used);
            if remaining_records <= reserve.boundary_records {
                continue;
            }
            let prepared = match self.prepare_uncommitted_native_history(lane, &boundary) {
                Ok(prepared) => prepared,
                // A cheaper seal can hit its archive budget even when continuation fits.
                Err(
                    Error::Core(NativeError::Limit(_) | NativeError::Review(ReviewError::Limit(_)))
                    | Error::Review(ReviewError::Limit(_)),
                ) => continue,
                Err(error) => return Err(error),
            };
            let after =
                self.projected_native_history_capacity(capacity, &prepared.candidate, &boundary)?;
            if reserve.fits(lane, &after) {
                let append = self.native_boundary_append(principal, lane, &boundary, &prepared)?;
                self.check_native_history_append_cut(&source)?;
                return Ok(ServerNativeHistoryReserveOutcome::Boundary {
                    plan: Box::new(ServerNativeHistoryPlan {
                        selection: select_boundary(source, lane, boundary, &prepared, append),
                        capacity_before: capacity,
                        capacity_after: after,
                    }),
                });
            }
        }
        self.check_native_history_append_cut(&source)?;
        Ok(ServerNativeHistoryReserveOutcome::Unavailable { source, capacity: Box::new(capacity) })
    }
}
