//! Rich AST materialization over independently replicated structure, text and owned metadata.
//!
//! This is the in-progress shared editor coordinator, not a shipping transport.
//! A semantic Document V2 is a validated export, never a mutable shared root register.

pub mod actions;
mod column_order;
mod initialize;
mod materialize;
mod model;
mod placement;
mod session;
mod text;
mod update_frame;

pub use actions::Command;
pub use session::RichReplica;
