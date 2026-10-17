//! Application-configured shared factory; the fixed fixture probe remains a separate path.
mod restore_document;
mod restore_general;
mod restore_reviewed;
mod restore_typing;
use crate::{rich_replica::SharedRichProfile as Profile, rich_replica_wasm::RichReplicaProbe};
use wasm_bindgen::prelude::*;
fn error(value: impl std::fmt::Display) -> JsValue {
    JsValue::from_str(&value.to_string())
}

/// Immutable compiled shared grammar. Freeing it does not dispose any returned writer.
#[wasm_bindgen]
pub struct SharedRichProfile {
    inner: Profile,
}
#[wasm_bindgen]
impl SharedRichProfile {
    /// Explicit bounded layout V3, causal model13 and journal14; never an implicit migration.
    pub fn from_configuration_json_v3(input: &str) -> Result<Self, JsValue> {
        Ok(Self { inner: Profile::from_configuration_json_v3(input).map_err(error)? })
    }
    /// Compose standard inline V1 with layout V3 using explicit configuration format3.
    pub fn from_standard_configuration_json_v3(input: &str) -> Result<Self, JsValue> {
        Ok(Self { inner: Profile::from_standard_configuration_json_v3(input).map_err(error)? })
    }
    /// Explicit structural V2; original factories never select model 12/journal 13.
    pub fn from_configuration_json_v2(input: &str) -> Result<Self, JsValue> {
        Ok(Self { inner: Profile::from_configuration_json_v2(input).map_err(error)? })
    }
    /// Compose standard inline V1 with structural V2 using configuration format 2.
    pub fn from_standard_configuration_json_v2(input: &str) -> Result<Self, JsValue> {
        Ok(Self { inner: Profile::from_standard_configuration_json_v2(input).map_err(error)? })
    }
    /// Opt into the original standard inline V1 preset without changing ordinary V1 config.
    pub fn from_standard_configuration_json_v1(input: &str) -> Result<Self, JsValue> {
        Ok(Self { inner: Profile::from_standard_configuration_json_v1(input).map_err(error)? })
    }
    /// Compile strict bounded original V1 configuration; never trust a supplied fingerprint.
    pub fn from_configuration_json(input: &str) -> Result<Self, JsValue> {
        Ok(Self { inner: Profile::from_configuration_json(input).map_err(error)? })
    }
    /// Read exact compiled schema binding, private model/history revision and tightened budgets.
    pub fn descriptor_json(&self) -> String {
        self.inner.descriptor_json()
    }
    /// Read the original read-only typed-format catalog from the compiled Rust schema.
    pub fn inline_catalog_json(&self) -> String {
        self.inner.inline_catalog_json()
    }
    /// Seed one fresh document under the host's already-acquired exclusive writer lease.
    pub fn create(&self, document: &str, writer: String) -> Result<RichReplicaProbe, JsValue> {
        self.inner.create(document, writer).map(RichReplicaProbe::from_replica).map_err(error)
    }
    /// Join a room-bound frame with a fresh separately leased writer.
    pub fn join_frame(
        &self,
        room: String,
        writer: String,
        frame: &str,
    ) -> Result<RichReplicaProbe, JsValue> {
        self.inner
            .join_frame(room, writer, frame)
            .map(RichReplicaProbe::from_replica)
            .map_err(error)
    }
    /// Resume exact selective history only after reacquiring that writer's lease.
    pub fn restore(&self, room: &str, journal: &str) -> Result<RichReplicaProbe, JsValue> {
        self.inner.restore(room, journal).map(RichReplicaProbe::from_replica).map_err(error)
    }
}
