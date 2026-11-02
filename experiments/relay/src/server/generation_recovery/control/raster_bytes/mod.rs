//! Complete immutable raster bytes from an inactive selected recovery host.
mod read;
mod request;
pub(super) use read::read;
pub(super) use request::MAX_REQUEST_BYTES;
