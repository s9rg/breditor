//! Explicit physical storage actions; no original file API infers this separate family.
mod create;
mod create_atomic_v2;
mod descriptor;
mod open;
mod rotate;
#[cfg(test)]
mod tests;
