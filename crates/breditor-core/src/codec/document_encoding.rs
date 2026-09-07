use serde::{
    Serialize,
    ser::{SerializeMap, SerializeSeq, SerializeStruct},
};

use crate::document::{
    Children, Document, Format, FormatSet, NodeRef, PropertyMap, PropertyObject, PropertyValue,
    PropertyValueInner,
};

use super::{
    document_json::{DOCUMENT_FORMAT, DOCUMENT_FORMAT_VERSION},
    document_json_v2::DOCUMENT_V2_FORMAT_VERSION,
    schema_binding_encoding::SchemaBindingEncoding,
};

/// Borrowed deterministic encoding of one validated document as Document V1.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) struct DocumentEncoding<'a> {
    document: &'a Document,
}

impl<'a> DocumentEncoding<'a> {
    /// Borrows a document for serialization without constructing an owned record tree.
    pub(crate) const fn new(document: &'a Document) -> Self {
        Self { document }
    }
}

impl Serialize for DocumentEncoding<'_> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let mut record = serializer.serialize_struct("DocumentRecordV1", 4)?;
        record.serialize_field("format", DOCUMENT_FORMAT)?;
        record.serialize_field("formatVersion", &DOCUMENT_FORMAT_VERSION)?;
        record.serialize_field("schema", &SchemaEncoding(self.document))?;
        record.serialize_field("root", &NodeEncoding(self.document.root()))?;
        record.end()
    }
}

/// Borrowed deterministic encoding of one validated document as Document V2.
///
/// This encoder is crate-private so outer V2 records can embed exactly one V2
/// document without allocating or round-tripping nested JSON.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) struct DocumentEncodingV2<'a> {
    document: &'a Document,
}

impl<'a> DocumentEncodingV2<'a> {
    /// Borrows a document for serialization without constructing an owned record tree.
    pub(crate) const fn new(document: &'a Document) -> Self {
        Self { document }
    }
}

impl Serialize for DocumentEncodingV2<'_> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let mut record = serializer.serialize_struct("DocumentRecordV2", 5)?;
        record.serialize_field("format", DOCUMENT_FORMAT)?;
        record.serialize_field("formatVersion", &DOCUMENT_V2_FORMAT_VERSION)?;
        SchemaBindingEncoding::new(self.document.schema(), self.document.schema_fingerprint())
            .serialize_fields(&mut record)?;
        record.serialize_field("root", &NodeEncoding(self.document.root()))?;
        record.end()
    }
}

struct SchemaEncoding<'a>(&'a Document);

impl Serialize for SchemaEncoding<'_> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let mut record = serializer.serialize_struct("SchemaIdRecord", 2)?;
        record.serialize_field("name", self.0.schema().name().as_str())?;
        record.serialize_field("version", &self.0.schema().version().get())?;
        record.end()
    }
}

struct NodeEncoding<'a>(&'a NodeRef);

impl Serialize for NodeEncoding<'_> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        if let Some(element) = self.0.as_element() {
            let mut record = serializer.serialize_struct("NodeRecordV1", 5)?;
            record.serialize_field("kind", "element")?;
            record.serialize_field("type", element.kind().as_str())?;
            record.serialize_field(
                "entityId",
                &element.entity_id().map(crate::identity::EntityId::as_str),
            )?;
            record.serialize_field("properties", &PropertyMapEncoding(element.properties()))?;
            record.serialize_field("children", &ChildrenEncoding(element.children()))?;
            return record.end();
        }
        if let Some(text) = self.0.as_text() {
            let mut record = serializer.serialize_struct("NodeRecordV1", 3)?;
            record.serialize_field("kind", "text")?;
            record.serialize_field("text", text.text())?;
            record.serialize_field("formats", &FormatSetEncoding(text.formats()))?;
            return record.end();
        }
        Err(serde::ser::Error::custom("validated document node has no runtime variant"))
    }
}

struct ChildrenEncoding<'a>(&'a Children);

impl Serialize for ChildrenEncoding<'_> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let mut sequence = serializer.serialize_seq(Some(self.0.len()))?;
        for child in self.0 {
            sequence.serialize_element(&NodeEncoding(child))?;
        }
        sequence.end()
    }
}

struct FormatSetEncoding<'a>(&'a FormatSet);

impl Serialize for FormatSetEncoding<'_> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let mut sequence = serializer.serialize_seq(Some(self.0.len()))?;
        for format in self.0 {
            sequence.serialize_element(&FormatEncoding(format))?;
        }
        sequence.end()
    }
}

struct FormatEncoding<'a>(&'a Format);

impl Serialize for FormatEncoding<'_> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let mut record = serializer.serialize_struct("FormatRecordV1", 2)?;
        record.serialize_field("type", self.0.kind().as_str())?;
        record.serialize_field("properties", &PropertyMapEncoding(self.0.properties()))?;
        record.end()
    }
}

struct PropertyMapEncoding<'a>(&'a PropertyMap);

impl Serialize for PropertyMapEncoding<'_> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let mut map = serializer.serialize_map(Some(self.0.len()))?;
        for (name, value) in self.0 {
            map.serialize_entry(name.as_str(), &PropertyValueEncoding(value))?;
        }
        map.end()
    }
}

struct PropertyValueEncoding<'a>(&'a PropertyValue);

impl Serialize for PropertyValueEncoding<'_> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        match self.0.inner() {
            PropertyValueInner::Null => serializer.serialize_unit(),
            PropertyValueInner::Boolean(value) => serializer.serialize_bool(*value),
            PropertyValueInner::Integer(value) => serializer.serialize_i64(value.get()),
            PropertyValueInner::String(value) => serializer.serialize_str(value),
            PropertyValueInner::Array(values) => {
                let mut sequence = serializer.serialize_seq(Some(values.len()))?;
                for value in values.iter() {
                    sequence.serialize_element(&Self(value))?;
                }
                sequence.end()
            }
            PropertyValueInner::Object(values) => {
                PropertyObjectEncoding(values).serialize(serializer)
            }
        }
    }
}

struct PropertyObjectEncoding<'a>(&'a PropertyObject);

impl Serialize for PropertyObjectEncoding<'_> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let mut map = serializer.serialize_map(Some(self.0.len()))?;
        for (key, value) in self.0 {
            map.serialize_entry(key, &PropertyValueEncoding(value))?;
        }
        map.end()
    }
}
