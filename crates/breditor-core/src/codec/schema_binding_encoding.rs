use serde::{Serialize, ser::SerializeStruct};

use crate::schema::{SchemaFingerprint, SchemaId};

/// Borrowed schema-binding prefix shared by fingerprint-bearing record encoders.
#[derive(Clone, Copy, Debug)]
pub(crate) struct SchemaBindingEncoding<'a> {
    schema: &'a SchemaId,
    fingerprint: SchemaFingerprint,
}

impl<'a> SchemaBindingEncoding<'a> {
    pub(crate) const fn new(schema: &'a SchemaId, fingerprint: SchemaFingerprint) -> Self {
        Self { schema, fingerprint }
    }

    /// Emits the required `schema`, then `schemaFingerprint`, direct fields.
    pub(crate) fn serialize_fields<S>(&self, record: &mut S) -> Result<(), S::Error>
    where
        S: SerializeStruct,
    {
        record.serialize_field("schema", &SchemaIdEncoding(self.schema))?;
        record.serialize_field("schemaFingerprint", &SchemaFingerprintEncoding(self.fingerprint))
    }
}

struct SchemaIdEncoding<'a>(&'a SchemaId);

impl Serialize for SchemaIdEncoding<'_> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let mut record = serializer.serialize_struct("SchemaIdRecord", 2)?;
        record.serialize_field("name", self.0.name().as_str())?;
        record.serialize_field("version", &self.0.version().get())?;
        record.end()
    }
}

struct SchemaFingerprintEncoding(SchemaFingerprint);

impl Serialize for SchemaFingerprintEncoding {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.collect_str(&self.0)
    }
}
