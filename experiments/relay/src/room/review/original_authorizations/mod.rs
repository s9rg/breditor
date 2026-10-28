//! Explicit original role ranges read from actual durable native acceptance.
mod contract;
mod read;
mod request;
mod windows;
pub use contract::*;
#[cfg(test)]
mod tests;
