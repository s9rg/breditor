//! Explicit native retention boundaries; original room defaults and global receipts remain intact.
mod boundary;
mod capacity;
pub(in crate::room) mod checkpoint;
mod continue_document;
mod continue_review;
mod descriptor;
mod enable_document;
mod enable_review;
mod lane;
mod prepare;
mod prepare_review;
mod receipt;
mod replay;
mod seal_document;
mod seal_review;
#[cfg(test)]
mod tests;
mod transaction;

pub use boundary::ServerNativeHistoryBoundary;
pub(crate) use boundary::ServerNativeHistoryBoundary as NativeHistoryBoundary;
pub use capacity::{ServerNativeHistoryCapacity, ServerNativeLaneCapacity};
pub use descriptor::{ServerNativeHistoryDescriptor, ServerNativeHistoryFamily};
pub use lane::ServerNativeHistoryLane;
pub use receipt::ServerNativeHistoryReceipt;
