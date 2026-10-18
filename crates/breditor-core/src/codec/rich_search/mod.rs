//! Separate bounded search intentions and immutable reads, never persisted commands.
mod error;
mod input;
mod results;

pub use error::RichSearchCodecError;
pub use input::{
    decode_rich_search_index, decode_rich_search_navigation, decode_rich_search_query,
    decode_rich_search_replacement,
};
pub use results::{
    RICH_SEARCH_RESULTS_FORMAT, RICH_SEARCH_RESULTS_MAX_JSON_BYTES, RICH_SEARCH_RESULTS_VERSION,
    encode_rich_search_results,
};
