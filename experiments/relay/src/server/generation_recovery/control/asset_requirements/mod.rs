//! Actual provider bytes for complete declared client bindings and independent whole-upload IDs.
mod read;
mod report;
mod request;
mod resolve;
pub(super) use read::read;
pub(super) use request::MAX_BYTES;
