//! Accepted native payload transfer from the exact authenticated selected server cut.
mod read;
mod report;
mod request;
pub(super) use read::read;
pub(super) use request::MAX_REQUEST_BYTES;
