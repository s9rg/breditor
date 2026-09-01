//! Strict versioned codecs for untrusted persisted data.

mod document_json;
mod error;

pub use document_json::{DOCUMENT_FORMAT, DOCUMENT_FORMAT_VERSION, DocumentJsonCodec};
pub use error::{CodecErrorCode, DocumentCodecError, JsonFailure, JsonFailureKind};
