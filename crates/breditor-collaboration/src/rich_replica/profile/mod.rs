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
    pub(super) codec: DocumentJsonCodecV2,
    pub(super) protocol: super::protocol::Protocol,
}
impl SharedRichProfile {
    /// Explicitly compose standard inline V1 before resolving application dependencies.
    /// # Errors
    /// Duplicate/conflicting declarations, invalid budgets or incompatible rich input reject.
    pub fn from_standard_configuration_json_v1(input: &str) -> Result<Self, Error> {
        let (schema, limits) = configuration::compile_with_standard(input, true)?;
        Self::from_schema(schema, limits)
    }
    /// Bind an already compiled rich schema without accepting caller fingerprints as proof.
    /// # Errors
    /// Rejects non-rich grammar, rich-language revisions other than V1 and budgets
    /// that widen the core defaults. Model 11 does not admit native structural V2.
    pub fn from_schema(schema: CompiledSchema, limits: DocumentLimits) -> Result<Self, Error> {
        if !schema.is_rich_content_profile() {
            return Err(Error::Contract("shared profile rich grammar"));
        }
        if schema.rich_content_revision() != Some(1) {
            return Err(Error::Contract("shared model 11 requires rich-language V1"));
        }
        limits::validate(&limits)?;
        Ok(Self {
            codec: DocumentJsonCodecV2::new(schema).with_limits(limits),
            protocol: super::protocol::Protocol::Original,
        })
    }
    /// Explicit native structural V2 profile, with causal model 12 and journal 13.
    ///
    /// This does not migrate V1 state. Browser and relay V2 support are separate
    /// capabilities; callers must not substitute this profile into V1 transports.
    /// # Errors
    /// Rejects other rich revisions and budgets that widen the core defaults.
    pub fn from_schema_v2(schema: CompiledSchema, limits: DocumentLimits) -> Result<Self, Error> {
        if schema.rich_content_revision() != Some(2) {
            return Err(Error::Contract("shared model 12 requires rich-language V2"));
        }
        limits::validate(&limits)?;
        Ok(Self {
            codec: DocumentJsonCodecV2::new(schema).with_limits(limits),
            protocol: super::protocol::Protocol::StructuralV2,
        })
    }
    /// Compile bounded configuration format 2 without automatically adding inline formats.
    /// # Errors
    /// Rejects V1 configuration, unknown fields and invalid declarations or budgets.
    pub fn from_configuration_json_v2(input: &str) -> Result<Self, Error> {
        let (schema, limits) = configuration::compile_revision(input, false, 2)?;
        Self::from_schema_v2(schema, limits)
    }
    /// Compose standard inline V1 declarations with structural rich-language V2.
    /// # Errors
    /// Rejects conflicting declarations and any configuration other than format 2.
    pub fn from_standard_configuration_json_v2(input: &str) -> Result<Self, Error> {
        let (schema, limits) = configuration::compile_revision(input, true, 2)?;
        Self::from_schema_v2(schema, limits)
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
        let mut descriptor = serde_json::json!({"format":"breditor/shared-rich-profile-descriptor","formatVersion":1,
            "abiVersion":1,"modelVersion":self.protocol.model(),"journalVersion":self.protocol.journal(),
            "schema":{"name":schema.id().name().as_str(),"version":schema.id().version().get()},
            "schemaFingerprint":schema.fingerprint().to_string(),"limits":limits::descriptor(self.limits())});
        if self.protocol == super::protocol::Protocol::StructuralV2 {
            descriptor["richLanguageVersion"] = serde_json::json!(2);
        }
        descriptor.to_string()
    }
    /// Read exact typed inline declarations for a schema-bound presentation compiler.
    /// This contains no room/history or presentation callbacks and grants no authority.
    #[must_use]
    pub fn inline_catalog_json(&self) -> String {
        breditor_core::codec::encode_inline_format_catalog(self.schema())
    }
    /// Seed an admitted Document V2 using a separately leased writer identity.
    /// # Errors
    /// Rejects wrong schema, invalid content, writer identity or shared budgets.
    pub fn create(&self, document: &str, writer: String) -> Result<RichReplica, Error> {
        RichReplica::new_bound(self.codec.clone(), document, writer)
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
        let bytes = super::update_frame::decode(&self.codec, &room, frame)?;
        RichReplica::join_bound(self.codec.clone(), room, writer, bytes)
    }
    /// Replay-admit exact history after reacquiring the same writer's exclusive lease.
    /// # Errors
    /// Rejects mismatched profiles, rooms, old journals or divergent future history.
    pub fn restore(&self, room: &str, journal: &str) -> Result<RichReplica, Error> {
        RichReplica::restore_bound(self.codec.clone(), room, journal)
    }
}
