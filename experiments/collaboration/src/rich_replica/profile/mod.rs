//! Reusable compiled-schema factory. Owners retain independent codec ownership.
mod bounded;
mod configuration;
mod limits;
use super::RichReplica;
use crate::Error;
use breditor_core::{
    codec::DocumentJsonCodecV2,
    schema::{CompiledSchema, DocumentLimits},
};

/// Immutable rich grammar and tightened host budgets for separately leased writers.
///
/// The factory holds no room, writer, document, history, storage or transport.
/// The host must still acquire an exclusive writer lease before create/join/restore.
#[derive(Clone)]
pub struct SharedRichProfile {
    codec: DocumentJsonCodecV2,
}
impl SharedRichProfile {
    /// Bind an already compiled rich schema without accepting caller fingerprints as proof.
    /// # Errors
    /// Rejects non-rich grammar and budgets that widen the core defaults.
    pub fn from_schema(schema: CompiledSchema, limits: DocumentLimits) -> Result<Self, Error> {
        if !schema.is_rich_content_profile() {
            return Err(Error::Contract("shared profile rich grammar"));
        }
        limits::validate(&limits)?;
        Ok(Self { codec: DocumentJsonCodecV2::new(schema).with_limits(limits) })
    }
    /// Compile original bounded `breditor/shared-rich-profile` V1 configuration.
    ///
    /// Custom typed formats extend the sealed table/image/nested-flow grammar.
    /// Behavior IDs/callbacks are not declarations: shared commands address formats directly.
    /// # Errors
    /// Rejects wrong/extra fields, incompatible extension sets, reserved identities and budgets.
    pub fn from_configuration_json(input: &str) -> Result<Self, Error> {
        let (schema, limits) = configuration::compile(input)?;
        Self::from_schema(schema, limits)
    }
    /// Read the immutable compiled grammar; cloning it preserves its proof allocation.
    #[must_use]
    pub fn schema(&self) -> &CompiledSchema {
        self.codec.schema()
    }
    /// Read exact host budgets independently of the durable schema fingerprint.
    #[must_use]
    pub const fn limits(&self) -> &DocumentLimits {
        self.codec.limits()
    }
    /// Inspect the ABI/model/history/schema and full host budgets without a room owner.
    #[must_use]
    pub fn descriptor_json(&self) -> String {
        let schema = self.schema();
        serde_json::json!({"format":"breditor/shared-rich-profile-descriptor","formatVersion":1,
            "abiVersion":1,"modelVersion":super::MODEL_VERSION,"journalVersion":super::session::JOURNAL_VERSION,
            "schema":{"name":schema.id().name().as_str(),"version":schema.id().version().get()},
            "schemaFingerprint":schema.fingerprint().to_string(),"limits":limits::descriptor(self.limits())}).to_string()
    }
    /// Seed an admitted Document V2 using a separately leased writer identity.
    /// # Errors
    /// Rejects wrong schema, invalid content, writer identity or shared budgets.
    pub fn create(&self, document: &str, writer: String) -> Result<RichReplica, Error> {
        RichReplica::new(self.codec.clone(), document, writer)
    }
    /// Join a room/model/engine/schema-bound update with a new exclusive writer.
    /// # Errors
    /// Rejects incompatible frames before importing causal engine bytes.
    pub fn join_frame(
        &self,
        room: String,
        writer: String,
        frame: &str,
    ) -> Result<RichReplica, Error> {
        RichReplica::join_frame(self.codec.clone(), room, writer, frame)
    }
    /// Replay-admit exact history after reacquiring the same writer's exclusive lease.
    /// # Errors
    /// Rejects mismatched profiles, rooms, old journals or divergent future history.
    pub fn restore(&self, room: &str, journal: &str) -> Result<RichReplica, Error> {
        RichReplica::restore(self.codec.clone(), room, journal)
    }
}
