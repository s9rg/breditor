//! Separate original-role read. Old continuity/assets/native response families stay closed.
mod read;
mod request;
pub(super) use read::read;
pub(super) use request::MAX_REQUEST_BYTES;
