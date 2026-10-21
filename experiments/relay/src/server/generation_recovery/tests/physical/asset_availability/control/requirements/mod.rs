//! Real native/raster/provider HTTP closure, distinct bindings and unreferenced whole uploads.
mod admission;
mod callbacks;
mod http;
mod workflow;
use super::super::super::super::source::TestResult;
use super::{
    fixture::Setup,
    network::{Network, Request},
};
use http::{body, query};
