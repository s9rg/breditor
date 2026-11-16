//! Detached capacity of all native owners at one authenticated room cut.
use super::ServerNativeHistoryFamily;
use crate::{Result, Room};
use breditor_collab_feasibility::{
    NativeHistoryUsage,
    review::ReviewHistoryCapacity,
    rich_replica::{DocumentHistoryCapacity, RichReplica},
};
use serde::Serialize;

/// Usage paired with the exact checkpoint family selected on this native lane.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerNativeLaneCapacity<T> {
    /// Selected native recovery family.
    pub family: ServerNativeHistoryFamily,
    /// Exact native counts and encoded bytes at the selected cut.
    #[serde(flatten)]
    pub capacity: T,
}

/// Independent native history capacity of an authenticated room cut.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerNativeHistoryCapacity {
    /// Detached native-capacity report format.
    pub format: &'static str,
    /// Exact revision of this report.
    pub format_version: u32,
    /// Document receiver's actual journal and history policy.
    pub document: ServerNativeLaneCapacity<DocumentHistoryCapacity>,
    /// Review receiver, if the independent review lane is enabled.
    pub review: Option<ServerNativeLaneCapacity<ReviewHistoryCapacity>>,
    /// Private suggestion writer, if suggestion effects are enabled.
    pub suggestion_effect: Option<ServerNativeLaneCapacity<DocumentHistoryCapacity>>,
    /// Retained receipts and ceiling for the currently selected native families.
    pub boundary_records: NativeHistoryUsage,
}

fn document(owner: &RichReplica) -> Result<ServerNativeLaneCapacity<DocumentHistoryCapacity>> {
    Ok(ServerNativeLaneCapacity {
        family: ServerNativeHistoryFamily::document(owner),
        capacity: owner.document_history_capacity()?,
    })
}

impl Room {
    /// Read native capacity for the current owner without granting storage or writer rights.
    /// Log, raster and client journal limits are measured separately.
    /// # Errors
    /// Non-owner access, uncertain storage or an invalid native capacity cut refuses the read.
    pub fn native_history_capacity(&self, principal: &str) -> Result<ServerNativeHistoryCapacity> {
        self.recovery_inventory_owner(principal)?;
        let review = self
            .review
            .as_ref()
            .map(|state| {
                Ok::<_, crate::Error>(ServerNativeLaneCapacity {
                    family: ServerNativeHistoryFamily::review(&state.session),
                    capacity: state.session.review_history_capacity()?,
                })
            })
            .transpose()?;
        let suggestion_effect =
            self.suggestions.as_ref().map(|state| document(&state.effect_owner)).transpose()?;
        Ok(ServerNativeHistoryCapacity {
            format: "breditor/relay-native-history-capacity",
            format_version: 1,
            document: document(&self.replica)?,
            review,
            suggestion_effect,
            boundary_records: NativeHistoryUsage {
                used: self.native_history_boundaries.len(),
                limit: self.native_boundary_limit(None),
            },
        })
    }
}
