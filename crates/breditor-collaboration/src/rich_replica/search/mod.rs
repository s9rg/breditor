//! Opt-in shared search over exact causal observations and explicit semantic replay.
mod apply;
mod checkpoint;
mod enable_history;
mod find;
mod history_family;
mod insert;
mod record;
mod replace_all;
mod replace_one;
mod restore;
mod results;
mod select_match;
mod selection;
mod validate_results;

pub(super) use history_family::journal;
pub(super) use record::SearchActionV1;
pub use results::SharedSearchResults;

const FORMAT: &str = "breditor/shared-search-session";
