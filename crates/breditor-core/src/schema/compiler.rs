use std::{
    collections::BTreeMap,
    fmt,
    sync::{Arc, OnceLock},
};

use sha2::{Digest, Sha256};
use thiserror::Error;

use crate::{
    extension::{
        ExtensionId, ExtensionSet, InlineFormatPropertyContractV1, InlineFormatPropertyTypeV1,
        PropertyPresenceV1,
    },
    identity::QualifiedName,
    schema::{
        PersistedTypeRevision, SchemaCompilationError, SchemaFingerprint, SchemaId, SchemaVersion,
    },
};

use super::compiled_schema::CompiledSchema;

const CANONICAL_ENCODING_VERSION: u32 = 1;
const SCHEMA_VALUE_MODEL_VERSION: u32 = 1;
const SCHEMA_COMPILER_CONTRACT_VERSION_V1: u32 = 1;
const SCHEMA_COMPILER_CONTRACT_VERSION_TYPED_PROPERTIES: u32 = 2;
const FINGERPRINT_DOMAIN: &[u8] = b"breditor/schema-fingerprint\0";

const MAX_ELEMENT_TYPES: u32 = 256;
const MAX_INLINE_FORMAT_TYPES: u32 = 256;

/// Maximum extension-owned inline formats in one sealed base-text profile.
///
/// The compiler's 256-format ceiling includes the built-in `breditor/strong`
/// declaration, leaving 255 identities for extensions.
pub const MAX_BASE_TEXT_EXTENSION_INLINE_FORMATS: u32 = MAX_INLINE_FORMAT_TYPES - 1;

#[derive(Clone, Debug, Eq, PartialEq)]
pub(super) struct CompiledSchemaDefinition {
    id: SchemaId,
    root_kind: QualifiedName,
    paragraph_kind: QualifiedName,
    strong_kind: QualifiedName,
    constraints: GlobalConstraints,
    elements: BTreeMap<QualifiedName, ElementDefinition>,
    inline_formats: BTreeMap<QualifiedName, InlineFormatDefinition>,
}

impl CompiledSchemaDefinition {
    pub(super) const fn id(&self) -> &SchemaId {
        &self.id
    }

    pub(super) const fn root_kind(&self) -> &QualifiedName {
        &self.root_kind
    }

    pub(super) const fn paragraph_kind(&self) -> &QualifiedName {
        &self.paragraph_kind
    }

    pub(super) const fn strong_kind(&self) -> &QualifiedName {
        &self.strong_kind
    }

    pub(super) fn element(&self, kind: &QualifiedName) -> Option<&ElementDefinition> {
        self.elements.get(kind)
    }

    pub(super) fn inline_format(&self, kind: &QualifiedName) -> Option<&InlineFormatDefinition> {
        self.inline_formats.get(kind)
    }

    pub(super) fn inline_formats(
        &self,
    ) -> impl ExactSizeIterator<Item = (&QualifiedName, &InlineFormatDefinition)> {
        self.inline_formats.iter()
    }

    pub(super) const fn constraints(&self) -> GlobalConstraints {
        self.constraints
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(super) struct ElementDefinition {
    revision: PersistedTypeRevision,
    allows_properties: bool,
    allows_entity_id: bool,
    children: ChildConstraint,
}

impl ElementDefinition {
    pub(super) const fn allows_properties(&self) -> bool {
        self.allows_properties
    }

    pub(super) const fn allows_entity_id(&self) -> bool {
        self.allows_entity_id
    }

    pub(super) const fn children(&self) -> &ChildConstraint {
        &self.children
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(super) struct InlineFormatDefinition {
    revision: PersistedTypeRevision,
    property_contract: Option<InlineFormatPropertyContractV1>,
}

impl InlineFormatDefinition {
    pub(super) const fn revision(&self) -> PersistedTypeRevision {
        self.revision
    }

    pub(super) const fn property_contract(&self) -> Option<&InlineFormatPropertyContractV1> {
        self.property_contract.as_ref()
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(super) struct GlobalConstraints {
    non_empty_text: ConstraintMode,
    canonical_format_order: ConstraintMode,
    unique_format_kinds: ConstraintMode,
    merged_adjacent_equal_text: ConstraintMode,
    globally_unique_entity_ids: ConstraintMode,
}

impl GlobalConstraints {
    pub(super) const fn requires_non_empty_text(self) -> bool {
        self.non_empty_text.is_enforced()
    }

    pub(super) const fn requires_canonical_format_order(self) -> bool {
        self.canonical_format_order.is_enforced()
    }

    pub(super) const fn requires_unique_format_kinds(self) -> bool {
        self.unique_format_kinds.is_enforced()
    }

    pub(super) const fn requires_merged_adjacent_equal_text(self) -> bool {
        self.merged_adjacent_equal_text.is_enforced()
    }

    pub(super) const fn requires_globally_unique_entity_ids(self) -> bool {
        self.globally_unique_entity_ids.is_enforced()
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum ConstraintMode {
    // These laws are also enforced by the canonical AST constructors. A second
    // mode cannot be added until the value model can represent it and the
    // schema value-model contract version changes.
    Enforced,
}

impl ConstraintMode {
    const fn is_enforced(self) -> bool {
        matches!(self, Self::Enforced)
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(super) struct ChildConstraint {
    kind: ChildKind,
    minimum: u32,
    maximum: Option<u32>,
}

impl ChildConstraint {
    pub(super) const fn kind(&self) -> &ChildKind {
        &self.kind
    }

    pub(super) const fn minimum(&self) -> u32 {
        self.minimum
    }

    pub(super) const fn maximum(&self) -> Option<u32> {
        self.maximum
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(super) enum ChildKind {
    Text,
    Element(QualifiedName),
}

#[derive(Clone, Debug, Eq, PartialEq)]
enum DeclarationOwner {
    Breditor,
    Profile,
    Extension(ExtensionId),
}

impl fmt::Display for DeclarationOwner {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Breditor => formatter.write_str("the Breditor core"),
            Self::Profile => formatter.write_str("the compiled profile"),
            Self::Extension(id) => write!(formatter, "extension {id}"),
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct SchemaSpec {
    id: SchemaId,
    owner: DeclarationOwner,
    root_kind: QualifiedName,
    paragraph_kind: QualifiedName,
    strong_kind: QualifiedName,
    constraints: GlobalConstraints,
    elements: Vec<ElementSpec>,
    inline_formats: Vec<InlineFormatSpec>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct ElementSpec {
    kind: QualifiedName,
    owner: DeclarationOwner,
    revision: PersistedTypeRevision,
    allows_properties: bool,
    allows_entity_id: bool,
    children: ChildConstraint,
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct InlineFormatSpec {
    kind: QualifiedName,
    owner: DeclarationOwner,
    revision: PersistedTypeRevision,
    property_contract: Option<InlineFormatPropertyContractV1>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct CompilerLimits {
    max_elements: u32,
    max_inline_formats: u32,
}

impl Default for CompilerLimits {
    fn default() -> Self {
        Self { max_elements: MAX_ELEMENT_TYPES, max_inline_formats: MAX_INLINE_FORMAT_TYPES }
    }
}

#[derive(Clone, Debug, Eq, Error, PartialEq)]
enum SchemaCompilerError {
    #[error("schema has {actual} element types; the maximum is {maximum}")]
    TooManyElements { actual: u32, maximum: u32 },
    #[error("schema has {actual} inline-format types; the maximum is {maximum}")]
    TooManyInlineFormats { actual: u32, maximum: u32 },
    #[error("schema name {name} is reserved for the Breditor core, not {owner}")]
    ReservedSchemaName { name: QualifiedName, owner: DeclarationOwner },
    #[error("element name {name} is reserved for the Breditor core, not {owner}")]
    ReservedElementName { name: QualifiedName, owner: ExtensionId },
    #[error("inline-format name {name} is reserved for the Breditor core, not {owner}")]
    ReservedInlineFormatName { name: QualifiedName, owner: ExtensionId },
    #[error("element type {kind} is declared more than once")]
    DuplicateElement { kind: QualifiedName },
    #[error("inline-format type {kind} is declared more than once")]
    DuplicateInlineFormat { kind: QualifiedName },
    #[error("inline-format {kind} carries a property contract targeting {contract_target}")]
    InlineFormatPropertyContractTargetMismatch {
        kind: QualifiedName,
        contract_target: QualifiedName,
    },
    #[error("root element {kind} is not registered")]
    UnknownRootElement { kind: QualifiedName },
    #[error("paragraph role element {kind} is not registered")]
    UnknownParagraphElement { kind: QualifiedName },
    #[error("strong role inline format {kind} is not registered")]
    UnknownStrongFormat { kind: QualifiedName },
    #[error("element {element} references unregistered child element {child}")]
    UnknownChildElement { element: QualifiedName, child: QualifiedName },
    #[error(
        "element {element} has minimum child count {minimum} above maximum child count {maximum}"
    )]
    InvalidChildCountRange { element: QualifiedName, minimum: u32, maximum: u32 },
}

static BASE_DEFINITION: OnceLock<(Arc<CompiledSchemaDefinition>, SchemaFingerprint)> =
    OnceLock::new();

pub(super) fn compile_breditor_base() -> CompiledSchema {
    let (definition, fingerprint) = BASE_DEFINITION.get_or_init(|| {
        let Ok(compiled) = compile(base_spec(), CompilerLimits::default()) else {
            unreachable!("trusted built-in schema failed to compile")
        };
        (Arc::clone(compiled.definition()), compiled.fingerprint())
    });
    CompiledSchema::from_compilation(Arc::clone(definition), *fingerprint)
}

pub(super) fn compile_base_text_profile(
    schema_id: SchemaId,
    extensions: &ExtensionSet,
) -> Result<CompiledSchema, SchemaCompilationError> {
    if schema_id.name().namespace() == "breditor" {
        return Err(SchemaCompilationError::ReservedSchemaName { name: schema_id.name().clone() });
    }

    if let Some(manifest) =
        extensions.manifests().find(|manifest| manifest.id().name().namespace() == "breditor")
    {
        return Err(SchemaCompilationError::ReservedExtensionName {
            extension: manifest.id().clone(),
        });
    }

    let format_count = extensions.manifests().fold(0_u32, |total, manifest| {
        total.saturating_add(fixed_count(manifest.inline_formats().len()))
    });
    if format_count > MAX_BASE_TEXT_EXTENSION_INLINE_FORMATS {
        return Err(SchemaCompilationError::TooManyInlineFormats {
            actual: format_count,
            maximum: MAX_BASE_TEXT_EXTENSION_INLINE_FORMATS,
        });
    }

    let mut formats = extensions
        .manifests()
        .flat_map(|manifest| {
            manifest.inline_formats().iter().map(move |format| {
                let property_contract = manifest
                    .inline_format_property_contracts()
                    .binary_search_by(|contract| contract.format_kind().cmp(format.kind()))
                    .ok()
                    .map(|index| manifest.inline_format_property_contracts()[index].clone());
                (format.kind().clone(), manifest.id().clone(), format.revision(), property_contract)
            })
        })
        .collect::<Vec<_>>();
    formats.sort_by(|left, right| left.0.cmp(&right.0).then_with(|| left.1.cmp(&right.1)));
    if let Some(pair) = formats.windows(2).find(|pair| pair[0].0 == pair[1].0) {
        return Err(SchemaCompilationError::DuplicateInlineFormat {
            kind: pair[0].0.clone(),
            first_owner: pair[0].1.clone(),
            second_owner: pair[1].1.clone(),
        });
    }
    if let Some((kind, owner, _, _)) =
        formats.iter().find(|(kind, _, _, _)| kind.namespace() == "breditor")
    {
        return Err(SchemaCompilationError::ReservedInlineFormatName {
            kind: kind.clone(),
            owner: owner.clone(),
        });
    }

    let mut spec = base_spec();
    spec.id = schema_id;
    spec.owner = DeclarationOwner::Profile;
    spec.inline_formats.extend(formats.into_iter().map(
        |(kind, owner, revision, property_contract)| InlineFormatSpec {
            kind,
            owner: DeclarationOwner::Extension(owner),
            revision,
            property_contract,
        },
    ));
    compile(spec, CompilerLimits::default()).map_err(|_| SchemaCompilationError::InternalInvariant)
}

fn supports_base_text_structure(definition: &CompiledSchemaDefinition) -> bool {
    let base = base_spec();
    if definition.root_kind != base.root_kind
        || definition.paragraph_kind != base.paragraph_kind
        || definition.strong_kind != base.strong_kind
        || definition.constraints != base.constraints
        || definition.elements.len() != base.elements.len()
    {
        return false;
    }

    for element in &base.elements {
        let Some(compiled) = definition.elements.get(&element.kind) else {
            return false;
        };
        if compiled.revision != element.revision
            || compiled.allows_properties != element.allows_properties
            || compiled.allows_entity_id != element.allows_entity_id
            || compiled.children != element.children
        {
            return false;
        }
    }

    let Some(strong) = definition.inline_formats.get(&base.strong_kind) else {
        return false;
    };
    strong.revision == PersistedTypeRevision::one() && strong.property_contract.is_none()
}

pub(super) fn supports_text_splice_operations(definition: &CompiledSchemaDefinition) -> bool {
    supports_base_text_structure(definition)
}

pub(super) fn supports_paragraph_structure_operations(
    definition: &CompiledSchemaDefinition,
) -> bool {
    supports_base_text_structure(definition)
}

pub(super) fn supports_base_text_operations(definition: &CompiledSchemaDefinition) -> bool {
    supports_base_text_structure(definition)
        && definition.inline_formats.values().all(|format| format.property_contract.is_none())
}

#[cfg(test)]
pub(super) fn compile_test_semantic_variant_same_id() -> CompiledSchema {
    let mut spec = base_spec();
    let Some(root) = spec.elements.iter_mut().find(|element| element.kind == spec.root_kind) else {
        unreachable!("trusted test schema must declare its root element")
    };
    root.children.minimum = 2;
    match compile(spec, CompilerLimits::default()) {
        Ok(compiled) => compiled,
        Err(error) => unreachable!("test-only semantic schema variant failed to compile: {error}"),
    }
}

pub(super) fn is_exact_breditor_base(definition: &CompiledSchemaDefinition) -> bool {
    let (base, _) = BASE_DEFINITION.get_or_init(|| {
        let Ok(compiled) = compile(base_spec(), CompilerLimits::default()) else {
            unreachable!("trusted built-in schema failed to compile")
        };
        (Arc::clone(compiled.definition()), compiled.fingerprint())
    });
    definition == base.as_ref()
}

fn compile(
    mut spec: SchemaSpec,
    limits: CompilerLimits,
) -> Result<CompiledSchema, SchemaCompilerError> {
    let element_count = fixed_count(spec.elements.len());
    if element_count > limits.max_elements {
        return Err(SchemaCompilerError::TooManyElements {
            actual: element_count,
            maximum: limits.max_elements,
        });
    }
    let inline_format_count = fixed_count(spec.inline_formats.len());
    if inline_format_count > limits.max_inline_formats {
        return Err(SchemaCompilerError::TooManyInlineFormats {
            actual: inline_format_count,
            maximum: limits.max_inline_formats,
        });
    }

    spec.elements.sort_by(|left, right| left.kind.cmp(&right.kind));
    spec.inline_formats.sort_by(|left, right| left.kind.cmp(&right.kind));

    if let Some(pair) = spec.elements.windows(2).find(|pair| pair[0].kind == pair[1].kind) {
        return Err(SchemaCompilerError::DuplicateElement { kind: pair[0].kind.clone() });
    }
    if let Some(pair) = spec.inline_formats.windows(2).find(|pair| pair[0].kind == pair[1].kind) {
        return Err(SchemaCompilerError::DuplicateInlineFormat { kind: pair[0].kind.clone() });
    }

    reject_reserved_schema_name(&spec)?;
    for element in &spec.elements {
        reject_reserved_element_name(element)?;
    }
    for inline_format in &spec.inline_formats {
        reject_reserved_inline_format_name(inline_format)?;
        reject_mismatched_inline_format_property_contract(inline_format)?;
    }

    let elements = spec
        .elements
        .iter()
        .map(|element| {
            (
                element.kind.clone(),
                ElementDefinition {
                    revision: element.revision,
                    allows_properties: element.allows_properties,
                    allows_entity_id: element.allows_entity_id,
                    children: element.children.clone(),
                },
            )
        })
        .collect::<BTreeMap<_, _>>();
    let inline_formats = spec
        .inline_formats
        .iter()
        .map(|inline_format| {
            (
                inline_format.kind.clone(),
                InlineFormatDefinition {
                    revision: inline_format.revision,
                    property_contract: inline_format.property_contract.clone(),
                },
            )
        })
        .collect::<BTreeMap<_, _>>();

    if !elements.contains_key(&spec.root_kind) {
        return Err(SchemaCompilerError::UnknownRootElement { kind: spec.root_kind });
    }
    if !elements.contains_key(&spec.paragraph_kind) {
        return Err(SchemaCompilerError::UnknownParagraphElement { kind: spec.paragraph_kind });
    }
    if !inline_formats.contains_key(&spec.strong_kind) {
        return Err(SchemaCompilerError::UnknownStrongFormat { kind: spec.strong_kind });
    }
    for (kind, element) in &elements {
        if let Some(maximum) = element.children.maximum
            && element.children.minimum > maximum
        {
            return Err(SchemaCompilerError::InvalidChildCountRange {
                element: kind.clone(),
                minimum: element.children.minimum,
                maximum,
            });
        }
        if let ChildKind::Element(child) = &element.children.kind
            && !elements.contains_key(child)
        {
            return Err(SchemaCompilerError::UnknownChildElement {
                element: kind.clone(),
                child: child.clone(),
            });
        }
    }

    let definition = Arc::new(CompiledSchemaDefinition {
        id: spec.id,
        root_kind: spec.root_kind,
        paragraph_kind: spec.paragraph_kind,
        strong_kind: spec.strong_kind,
        constraints: spec.constraints,
        elements,
        inline_formats,
    });
    let fingerprint = fingerprint(&definition);
    Ok(CompiledSchema::from_compilation(definition, fingerprint))
}

fn reject_reserved_schema_name(spec: &SchemaSpec) -> Result<(), SchemaCompilerError> {
    if spec.id.name().namespace() == "breditor"
        && !matches!(&spec.owner, DeclarationOwner::Breditor)
    {
        return Err(SchemaCompilerError::ReservedSchemaName {
            name: spec.id.name().clone(),
            owner: spec.owner.clone(),
        });
    }
    Ok(())
}

fn reject_reserved_element_name(element: &ElementSpec) -> Result<(), SchemaCompilerError> {
    if element.kind.namespace() == "breditor"
        && let DeclarationOwner::Extension(owner) = &element.owner
    {
        return Err(SchemaCompilerError::ReservedElementName {
            name: element.kind.clone(),
            owner: owner.clone(),
        });
    }
    Ok(())
}

fn reject_reserved_inline_format_name(
    inline_format: &InlineFormatSpec,
) -> Result<(), SchemaCompilerError> {
    if inline_format.kind.namespace() == "breditor"
        && let DeclarationOwner::Extension(owner) = &inline_format.owner
    {
        return Err(SchemaCompilerError::ReservedInlineFormatName {
            name: inline_format.kind.clone(),
            owner: owner.clone(),
        });
    }
    Ok(())
}

fn reject_mismatched_inline_format_property_contract(
    inline_format: &InlineFormatSpec,
) -> Result<(), SchemaCompilerError> {
    if let Some(contract) = &inline_format.property_contract
        && contract.format_kind() != &inline_format.kind
    {
        return Err(SchemaCompilerError::InlineFormatPropertyContractTargetMismatch {
            kind: inline_format.kind.clone(),
            contract_target: contract.format_kind().clone(),
        });
    }
    Ok(())
}

fn fingerprint(definition: &CompiledSchemaDefinition) -> SchemaFingerprint {
    let mut hasher = Sha256::new();
    encode_fingerprint(definition, |bytes| hasher.update(bytes));
    SchemaFingerprint::from_digest(hasher.finalize().into())
}

fn encode_fingerprint(definition: &CompiledSchemaDefinition, sink: impl FnMut(&[u8])) {
    let mut encoder = CanonicalFingerprintEncoder::new(sink);
    encoder.u32(0x01, CANONICAL_ENCODING_VERSION);
    encoder.u32(0x02, SCHEMA_VALUE_MODEL_VERSION);
    let compiler_contract_version =
        if definition.inline_formats.values().any(|format| format.property_contract.is_some()) {
            SCHEMA_COMPILER_CONTRACT_VERSION_TYPED_PROPERTIES
        } else {
            SCHEMA_COMPILER_CONTRACT_VERSION_V1
        };
    encoder.u32(0x03, compiler_contract_version);
    encoder.name(0x10, definition.id.name());
    encoder.u32(0x11, definition.id.version().get());
    encoder.name(0x12, &definition.root_kind);
    encoder.name(0x13, &definition.paragraph_kind);
    encoder.name(0x14, &definition.strong_kind);
    encoder.boolean(0x20, definition.constraints.non_empty_text.is_enforced());
    encoder.boolean(0x21, definition.constraints.canonical_format_order.is_enforced());
    encoder.boolean(0x22, definition.constraints.unique_format_kinds.is_enforced());
    encoder.boolean(0x23, definition.constraints.merged_adjacent_equal_text.is_enforced());
    encoder.boolean(0x24, definition.constraints.globally_unique_entity_ids.is_enforced());
    encoder.u32(0x30, fixed_count(definition.elements.len()));
    for (kind, element) in &definition.elements {
        encoder.tag(0x31);
        encoder.name(0x32, kind);
        encoder.u32(0x33, element.revision.get());
        encoder.boolean(0x34, element.allows_properties);
        encoder.boolean(0x35, element.allows_entity_id);
        match &element.children.kind {
            ChildKind::Text => encoder.tag(0x36),
            ChildKind::Element(child) => encoder.name(0x37, child),
        }
        encoder.u32(0x38, element.children.minimum);
        encoder.optional_u32(0x39, element.children.maximum);
    }
    encoder.u32(0x40, fixed_count(definition.inline_formats.len()));
    for (kind, inline_format) in &definition.inline_formats {
        encoder.tag(0x41);
        encoder.name(0x42, kind);
        encoder.u32(0x43, inline_format.revision.get());
        encoder.boolean(0x44, inline_format.property_contract.is_some());
        if let Some(contract) = &inline_format.property_contract {
            encoder.u32(0x45, 1);
            encoder.u32(0x46, fixed_count(contract.properties().len()));
            for property in contract.properties() {
                encoder.tag(0x47);
                encoder.name(0x48, property.name());
                encoder.byte(
                    0x49,
                    match property.presence() {
                        PropertyPresenceV1::Required => 0,
                        PropertyPresenceV1::Optional => 1,
                    },
                );
                match property.value_type() {
                    InlineFormatPropertyTypeV1::Boolean => encoder.byte(0x4a, 0),
                    InlineFormatPropertyTypeV1::Integer(integer) => {
                        encoder.byte(0x4a, 1);
                        encoder.optional_i64(
                            0x4b,
                            integer.minimum().map(crate::document::PropertyInteger::get),
                        );
                        encoder.optional_i64(
                            0x4c,
                            integer.maximum().map(crate::document::PropertyInteger::get),
                        );
                    }
                    InlineFormatPropertyTypeV1::String(string) => {
                        encoder.byte(0x4a, 2);
                        encoder.u32(0x4d, string.minimum_utf8_bytes());
                        encoder.u32(0x4e, string.maximum_utf8_bytes());
                    }
                }
            }
        }
    }
}

struct CanonicalFingerprintEncoder<F>(F);

impl<F> CanonicalFingerprintEncoder<F>
where
    F: FnMut(&[u8]),
{
    fn new(mut sink: F) -> Self {
        sink(FINGERPRINT_DOMAIN);
        Self(sink)
    }

    fn raw(&mut self, value: &[u8]) {
        (self.0)(value);
    }

    fn tag(&mut self, tag: u8) {
        self.raw(&[tag]);
    }

    fn u32(&mut self, tag: u8, value: u32) {
        self.tag(tag);
        self.raw(&value.to_be_bytes());
    }

    fn byte(&mut self, tag: u8, value: u8) {
        self.tag(tag);
        self.raw(&[value]);
    }

    fn optional_i64(&mut self, tag: u8, value: Option<i64>) {
        self.tag(tag);
        match value {
            None => self.raw(&[0]),
            Some(value) => {
                self.raw(&[1]);
                self.raw(&value.to_be_bytes());
            }
        }
    }

    fn optional_u32(&mut self, tag: u8, value: Option<u32>) {
        self.tag(tag);
        match value {
            None => self.raw(&[0]),
            Some(value) => {
                self.raw(&[1]);
                self.raw(&value.to_be_bytes());
            }
        }
    }

    fn boolean(&mut self, tag: u8, value: bool) {
        self.tag(tag);
        self.raw(&[u8::from(value)]);
    }

    fn name(&mut self, tag: u8, value: &QualifiedName) {
        self.bytes(tag, value.as_str().as_bytes());
    }

    fn bytes(&mut self, tag: u8, value: &[u8]) {
        self.tag(tag);
        let Ok(length) = u32::try_from(value.len()) else {
            unreachable!("qualified names have a fixed u32-sized byte limit")
        };
        self.raw(&length.to_be_bytes());
        self.raw(value);
    }
}

fn base_spec() -> SchemaSpec {
    let document_kind = QualifiedName::from_known_static("breditor/document");
    let paragraph_kind = QualifiedName::from_known_static("breditor/paragraph");
    let strong_kind = QualifiedName::from_known_static("breditor/strong");
    SchemaSpec {
        id: SchemaId::new(QualifiedName::from_known_static("breditor/base"), SchemaVersion::one()),
        owner: DeclarationOwner::Breditor,
        root_kind: document_kind.clone(),
        paragraph_kind: paragraph_kind.clone(),
        strong_kind: strong_kind.clone(),
        constraints: GlobalConstraints {
            non_empty_text: ConstraintMode::Enforced,
            canonical_format_order: ConstraintMode::Enforced,
            unique_format_kinds: ConstraintMode::Enforced,
            merged_adjacent_equal_text: ConstraintMode::Enforced,
            globally_unique_entity_ids: ConstraintMode::Enforced,
        },
        elements: vec![
            ElementSpec {
                kind: document_kind,
                owner: DeclarationOwner::Breditor,
                revision: PersistedTypeRevision::one(),
                allows_properties: false,
                allows_entity_id: false,
                children: ChildConstraint {
                    kind: ChildKind::Element(paragraph_kind.clone()),
                    minimum: 1,
                    maximum: None,
                },
            },
            ElementSpec {
                kind: paragraph_kind,
                owner: DeclarationOwner::Breditor,
                revision: PersistedTypeRevision::one(),
                allows_properties: false,
                allows_entity_id: false,
                children: ChildConstraint { kind: ChildKind::Text, minimum: 0, maximum: None },
            },
        ],
        inline_formats: vec![InlineFormatSpec {
            kind: strong_kind,
            owner: DeclarationOwner::Breditor,
            revision: PersistedTypeRevision::one(),
            property_contract: None,
        }],
    }
}

fn fixed_count(value: usize) -> u32 {
    u32::try_from(value).unwrap_or(u32::MAX)
}

#[cfg(test)]
mod tests {
    use std::{collections::BTreeSet, error::Error, fmt::Write as _};

    use crate::{
        document::PropertyInteger,
        extension::{
            ExtensionId, ExtensionVersion, InlineFormatPropertyContractV1,
            InlineFormatPropertySpecV1, InlineFormatPropertyTypeV1, PropertyPresenceV1,
        },
        identity::QualifiedName,
        schema::{
            CompiledSchema, DocumentLimits, PersistedTypeRevisionError, SchemaId, SchemaVersion,
        },
    };

    use super::{
        ChildConstraint, ChildKind, CompilerLimits, DeclarationOwner, ElementSpec,
        InlineFormatSpec, MAX_ELEMENT_TYPES, MAX_INLINE_FORMAT_TYPES, PersistedTypeRevision,
        SchemaCompilerError, base_spec, compile, encode_fingerprint,
    };

    type TestResult = Result<(), Box<dyn Error>>;

    fn extension(name: &str, version: u32) -> Result<ExtensionId, Box<dyn Error>> {
        Ok(ExtensionId::new(QualifiedName::try_new(name)?, ExtensionVersion::try_new(version)?))
    }

    fn external_owner(name: &str, version: u32) -> Result<DeclarationOwner, Box<dyn Error>> {
        Ok(DeclarationOwner::Extension(extension(name, version)?))
    }

    fn external_element(kind: QualifiedName, owner: DeclarationOwner) -> ElementSpec {
        ElementSpec {
            kind,
            owner,
            revision: PersistedTypeRevision::one(),
            allows_properties: false,
            allows_entity_id: false,
            children: ChildConstraint { kind: ChildKind::Text, minimum: 0, maximum: None },
        }
    }

    fn external_format(kind: QualifiedName, owner: DeclarationOwner) -> InlineFormatSpec {
        InlineFormatSpec {
            kind,
            owner,
            revision: PersistedTypeRevision::one(),
            property_contract: None,
        }
    }

    fn property_contract(
        format_kind: QualifiedName,
    ) -> Result<InlineFormatPropertyContractV1, Box<dyn Error>> {
        Ok(InlineFormatPropertyContractV1::try_new(
            format_kind,
            vec![InlineFormatPropertySpecV1::new(
                QualifiedName::try_new("example/value")?,
                PropertyPresenceV1::Required,
                InlineFormatPropertyTypeV1::boolean(),
            )],
        )?)
    }

    fn typed_property_schema(
        properties: Vec<InlineFormatPropertySpecV1>,
    ) -> Result<CompiledSchema, Box<dyn Error>> {
        let link_kind = QualifiedName::try_new("example/link")?;
        let contract = InlineFormatPropertyContractV1::try_new(link_kind.clone(), properties)?;
        let mut spec = base_spec();
        spec.id = SchemaId::new(
            QualifiedName::try_new("example/property-matrix")?,
            SchemaVersion::try_new(1)?,
        );
        spec.owner = DeclarationOwner::Profile;
        spec.inline_formats.push(InlineFormatSpec {
            kind: link_kind,
            owner: external_owner("example/link-extension", 1)?,
            revision: PersistedTypeRevision::one(),
            property_contract: Some(contract),
        });
        compile(spec, CompilerLimits::default()).map_err(Into::into)
    }

    #[test]
    fn base_fingerprint_is_a_locked_cross_implementation_vector() {
        let schema = super::compile_breditor_base();
        assert_eq!(
            schema.fingerprint().to_string(),
            "sha256:68aecbceb27b88171cf2f64f4ff6af8f4372fb338467eafd5fbf89ab04401173"
        );
    }

    #[test]
    fn base_canonical_bytes_are_a_locked_cross_implementation_vector() -> TestResult {
        let schema = super::compile_breditor_base();
        let mut bytes = Vec::new();
        encode_fingerprint(schema.definition(), |chunk| bytes.extend_from_slice(chunk));

        assert_eq!(bytes.len(), 282);
        let mut actual_hex = String::with_capacity(bytes.len() * 2);
        for byte in bytes {
            write!(&mut actual_hex, "{byte:02x}")?;
        }
        assert_eq!(
            actual_hex,
            concat!(
                "6272656469746f722f736368656d612d66696e6765727072696e7400",
                "010000000102000000010300000001",
                "100000000d6272656469746f722f626173651100000001",
                "12000000116272656469746f722f646f63756d656e74",
                "13000000126272656469746f722f706172616772617068",
                "140000000f6272656469746f722f7374726f6e67",
                "200121012201230124013000000002",
                "3132000000116272656469746f722f646f63756d656e74",
                "330000000134003500",
                "37000000126272656469746f722f706172616772617068",
                "38000000013900",
                "3132000000126272656469746f722f706172616772617068",
                "3300000001340035003638000000003900",
                "400000000141420000000f6272656469746f722f7374726f6e67",
                "43000000014400",
            )
        );
        Ok(())
    }

    #[test]
    fn typed_property_canonical_bytes_are_a_locked_cross_implementation_vector() -> TestResult {
        let link_kind = QualifiedName::try_new("example/link")?;
        let contract = InlineFormatPropertyContractV1::try_new(
            link_kind.clone(),
            vec![InlineFormatPropertySpecV1::new(
                QualifiedName::try_new("example/href")?,
                PropertyPresenceV1::Required,
                InlineFormatPropertyTypeV1::try_string(1, 2_048)?,
            )],
        )?;
        let mut spec = base_spec();
        spec.id = SchemaId::new(
            QualifiedName::try_new("example/link-profile")?,
            SchemaVersion::try_new(1)?,
        );
        spec.owner = DeclarationOwner::Profile;
        spec.inline_formats.push(InlineFormatSpec {
            kind: link_kind,
            owner: external_owner("example/link-extension", 1)?,
            revision: PersistedTypeRevision::one(),
            property_contract: Some(contract),
        });
        let schema = compile(spec, CompilerLimits::default())?;
        let mut bytes = Vec::new();
        encode_fingerprint(schema.definition(), |chunk| bytes.extend_from_slice(chunk));

        assert_eq!(bytes.len(), 356);
        let mut actual_hex = String::with_capacity(bytes.len() * 2);
        for byte in bytes {
            write!(&mut actual_hex, "{byte:02x}")?;
        }
        assert_eq!(
            actual_hex,
            concat!(
                "6272656469746f722f736368656d612d66696e6765727072696e7400",
                "010000000102000000010300000002",
                "10000000146578616d706c652f6c696e6b2d70726f66696c65",
                "1100000001",
                "12000000116272656469746f722f646f63756d656e74",
                "13000000126272656469746f722f706172616772617068",
                "140000000f6272656469746f722f7374726f6e67",
                "200121012201230124013000000002",
                "3132000000116272656469746f722f646f63756d656e74",
                "330000000134003500",
                "37000000126272656469746f722f706172616772617068",
                "38000000013900",
                "3132000000126272656469746f722f706172616772617068",
                "3300000001340035003638000000003900",
                "4000000002",
                "41420000000f6272656469746f722f7374726f6e6743000000014400",
                "41420000000c6578616d706c652f6c696e6b43000000014401",
                "45000000014600000001",
                "47480000000c6578616d706c652f6872656649004a02",
                "4d000000014e00000800",
            )
        );
        assert_eq!(
            schema.fingerprint().to_string(),
            "sha256:3903989dedf6015c4f81b16fdaaddafb4a7a100f1b7f61bfacef694b5141c9ef"
        );
        Ok(())
    }

    #[test]
    fn base_compilation_preserves_all_runtime_queries() {
        let schema = super::compile_breditor_base();
        assert_eq!(schema.id().to_string(), "breditor/base@1");
        assert_eq!(schema.root_kind().as_str(), "breditor/document");
        assert_eq!(schema.paragraph_kind().as_str(), "breditor/paragraph");
        assert_eq!(schema.strong_kind().as_str(), "breditor/strong");
        assert!(schema.knows_element(schema.root_kind()));
        assert!(schema.knows_element(schema.paragraph_kind()));
        assert!(schema.is_text_container(schema.paragraph_kind()));
        assert!(schema.allows_text_format(schema.strong_kind()));
        assert!(!schema.element_allows_properties(schema.root_kind()));
        assert!(!schema.element_allows_entity_id(schema.root_kind()));
        assert!(schema.inline_format_property_contract(schema.strong_kind()).is_none());
        assert!(schema.is_exact_breditor_base());
        assert!(schema.supports_base_text_operations());
    }

    #[test]
    fn registration_permutations_have_one_definition_and_fingerprint() -> TestResult {
        let owner = external_owner("example/format-pack", 7)?;
        let mut left = base_spec();
        left.elements
            .push(external_element(QualifiedName::try_new("example/aside")?, owner.clone()));
        left.inline_formats
            .push(external_format(QualifiedName::try_new("example/emphasis")?, owner.clone()));
        left.inline_formats
            .push(external_format(QualifiedName::try_new("example/highlight")?, owner));
        let mut right = left.clone();
        right.elements.reverse();
        right.inline_formats.reverse();

        let left = compile(left, CompilerLimits::default())?;
        let right = compile(right, CompilerLimits::default())?;
        assert_eq!(left, right);
        assert_eq!(left.fingerprint(), right.fingerprint());
        assert!(!left.shares_proof(right.proof()));
        Ok(())
    }

    #[test]
    fn schema_meaning_changes_change_the_fingerprint() -> TestResult {
        let base = base_spec();
        let mut revisions = base.clone();
        revisions.inline_formats[0].revision = PersistedTypeRevision::try_new(2)?;
        let mut child_count = base.clone();
        child_count.elements[0].children.minimum = 2;
        let mut properties = base.clone();
        properties.inline_formats[0].property_contract =
            Some(property_contract(properties.inline_formats[0].kind.clone())?);
        let mut entity_identity = base.clone();
        entity_identity.elements[0].allows_entity_id = true;
        let mut maximum = base.clone();
        maximum.elements[0].children.maximum = Some(1);

        let fingerprints = [base, revisions, child_count, properties, entity_identity, maximum]
            .into_iter()
            .map(|spec| compile(spec, CompilerLimits::default()).map(|schema| schema.fingerprint()))
            .collect::<Result<BTreeSet<_>, _>>()?;
        assert_eq!(fingerprints.len(), 6);
        Ok(())
    }

    #[test]
    fn every_typed_property_dimension_changes_the_fingerprint() -> TestResult {
        let property = |name, presence, value_type| {
            QualifiedName::try_new(name)
                .map(|name| InlineFormatPropertySpecV1::new(name, presence, value_type))
        };
        let required = PropertyPresenceV1::Required;
        let optional = PropertyPresenceV1::Optional;
        let zero = PropertyInteger::try_new(0)?;
        let ten = PropertyInteger::try_new(10)?;
        let variants = vec![
            vec![property(
                "example/value",
                required,
                InlineFormatPropertyTypeV1::try_string(1, 8)?,
            )?],
            vec![property(
                "example/value",
                optional,
                InlineFormatPropertyTypeV1::try_string(1, 8)?,
            )?],
            vec![property(
                "example/renamed",
                required,
                InlineFormatPropertyTypeV1::try_string(1, 8)?,
            )?],
            vec![property("example/value", required, InlineFormatPropertyTypeV1::boolean())?],
            vec![property(
                "example/value",
                required,
                InlineFormatPropertyTypeV1::try_integer(Some(zero), Some(ten))?,
            )?],
            vec![property(
                "example/value",
                required,
                InlineFormatPropertyTypeV1::try_integer(Some(zero), None)?,
            )?],
            vec![property(
                "example/value",
                required,
                InlineFormatPropertyTypeV1::try_integer(None, Some(ten))?,
            )?],
            vec![property(
                "example/value",
                required,
                InlineFormatPropertyTypeV1::try_string(0, 8)?,
            )?],
            vec![property(
                "example/value",
                required,
                InlineFormatPropertyTypeV1::try_string(1, 9)?,
            )?],
        ];
        let fingerprints = variants
            .into_iter()
            .map(typed_property_schema)
            .map(|result| result.map(|schema| schema.fingerprint()))
            .collect::<Result<BTreeSet<_>, _>>()?;
        assert_eq!(fingerprints.len(), 9);

        let alpha = property("example/alpha", optional, InlineFormatPropertyTypeV1::boolean())?;
        let omega =
            property("example/omega", required, InlineFormatPropertyTypeV1::try_string(1, 8)?)?;
        let forward = typed_property_schema(vec![alpha.clone(), omega.clone()])?;
        let reversed = typed_property_schema(vec![omega, alpha])?;
        assert_eq!(forward.fingerprint(), reversed.fingerprint());
        assert_eq!(forward, reversed);
        Ok(())
    }

    #[test]
    fn contribution_owner_and_version_do_not_change_content_identity() -> TestResult {
        let kind = QualifiedName::try_new("example/emphasis")?;
        let mut first = base_spec();
        first
            .inline_formats
            .push(external_format(kind.clone(), external_owner("example/first-package", 1)?));
        let mut second = base_spec();
        second
            .inline_formats
            .push(external_format(kind, external_owner("example/renamed-package", 99)?));

        let first = compile(first, CompilerLimits::default())?;
        let second = compile(second, CompilerLimits::default())?;
        assert_eq!(first, second);
        assert_eq!(first.fingerprint(), second.fingerprint());
        assert!(!first.shares_proof(second.proof()));
        Ok(())
    }

    #[test]
    fn host_document_limits_do_not_change_content_identity() {
        let schema = super::compile_breditor_base();
        let before = schema.fingerprint();
        let small = DocumentLimits::default()
            .with_max_json_bytes(1)
            .with_max_nodes(1)
            .with_max_text_bytes(1)
            .with_max_total_text_bytes(1)
            .with_max_property_string_bytes(1)
            .with_max_total_property_string_bytes(1);
        let large = DocumentLimits::default()
            .with_max_json_bytes(usize::MAX)
            .with_max_nodes(usize::MAX)
            .with_max_text_bytes(usize::MAX)
            .with_max_total_text_bytes(usize::MAX)
            .with_max_property_string_bytes(usize::MAX)
            .with_max_total_property_string_bytes(usize::MAX);

        assert_ne!(small, large);
        assert_eq!(schema.fingerprint(), before);
    }

    #[test]
    fn every_breditor_name_is_reserved_in_each_owned_namespace() -> TestResult {
        let owner_id = extension("example/attacker", 1)?;

        let mut schema_name = base_spec();
        schema_name.owner = DeclarationOwner::Extension(owner_id.clone());
        assert_eq!(
            compile(schema_name, CompilerLimits::default()),
            Err(SchemaCompilerError::ReservedSchemaName {
                name: QualifiedName::try_new("breditor/base")?,
                owner: DeclarationOwner::Extension(owner_id.clone()),
            })
        );

        let mut element_name = base_spec();
        element_name.elements.push(external_element(
            QualifiedName::try_new("breditor/future-element")?,
            DeclarationOwner::Extension(owner_id.clone()),
        ));
        assert_eq!(
            compile(element_name, CompilerLimits::default()),
            Err(SchemaCompilerError::ReservedElementName {
                name: QualifiedName::try_new("breditor/future-element")?,
                owner: owner_id.clone(),
            })
        );

        let mut format_name = base_spec();
        format_name.inline_formats.push(external_format(
            QualifiedName::try_new("breditor/future-format")?,
            DeclarationOwner::Extension(owner_id.clone()),
        ));
        assert_eq!(
            compile(format_name, CompilerLimits::default()),
            Err(SchemaCompilerError::ReservedInlineFormatName {
                name: QualifiedName::try_new("breditor/future-format")?,
                owner: owner_id,
            })
        );
        Ok(())
    }

    #[test]
    fn element_and_format_namespaces_are_typed_not_cross_colliding() -> TestResult {
        let shared = QualifiedName::try_new("example/shared")?;
        let owner = external_owner("example/package", 1)?;
        let mut spec = base_spec();
        spec.elements.push(external_element(shared.clone(), owner.clone()));
        spec.inline_formats.push(external_format(shared.clone(), owner));

        let schema = compile(spec, CompilerLimits::default())?;
        assert!(schema.knows_element(&shared));
        assert!(schema.allows_text_format(&shared));
        Ok(())
    }

    #[test]
    fn duplicate_diagnostics_are_independent_of_input_order() -> TestResult {
        let kind = QualifiedName::try_new("example/repeated")?;
        let first = external_element(kind.clone(), external_owner("example/alpha", 1)?);
        let second = external_element(kind.clone(), external_owner("example/beta", 2)?);
        let mut left = base_spec();
        left.elements.extend([first.clone(), second.clone()]);
        let mut right = base_spec();
        right.elements.extend([second, first]);

        let expected = Err(SchemaCompilerError::DuplicateElement { kind });
        assert_eq!(compile(left, CompilerLimits::default()), expected);
        assert_eq!(compile(right, CompilerLimits::default()), expected);
        Ok(())
    }

    #[test]
    fn rejects_unknown_roles_references_and_invalid_ranges() -> TestResult {
        let unknown = QualifiedName::try_new("example/unknown")?;

        let mut root = base_spec();
        root.root_kind = unknown.clone();
        assert_eq!(
            compile(root, CompilerLimits::default()),
            Err(SchemaCompilerError::UnknownRootElement { kind: unknown.clone() })
        );

        let mut paragraph = base_spec();
        paragraph.paragraph_kind = unknown.clone();
        assert_eq!(
            compile(paragraph, CompilerLimits::default()),
            Err(SchemaCompilerError::UnknownParagraphElement { kind: unknown.clone() })
        );

        let mut strong = base_spec();
        strong.strong_kind = unknown.clone();
        assert_eq!(
            compile(strong, CompilerLimits::default()),
            Err(SchemaCompilerError::UnknownStrongFormat { kind: unknown.clone() })
        );

        let mut child = base_spec();
        child.elements[0].children.kind = ChildKind::Element(unknown.clone());
        assert_eq!(
            compile(child, CompilerLimits::default()),
            Err(SchemaCompilerError::UnknownChildElement {
                element: QualifiedName::try_new("breditor/document")?,
                child: unknown,
            })
        );

        let mut range = base_spec();
        range.elements[0].children.minimum = 2;
        range.elements[0].children.maximum = Some(1);
        assert_eq!(
            compile(range, CompilerLimits::default()),
            Err(SchemaCompilerError::InvalidChildCountRange {
                element: QualifiedName::try_new("breditor/document")?,
                minimum: 2,
                maximum: 1,
            })
        );
        Ok(())
    }

    #[test]
    fn persisted_type_revision_is_nonzero_and_distinct() {
        assert_eq!(PersistedTypeRevision::try_new(0), Err(PersistedTypeRevisionError::Zero));
        assert_eq!(PersistedTypeRevision::try_new(7).map(PersistedTypeRevision::get), Ok(7));
    }

    #[test]
    fn accepts_exact_element_limit_and_rejects_limit_plus_one() -> TestResult {
        let owner = external_owner("example/element-pack", 1)?;
        let mut exact = base_spec();
        for index in 0..(MAX_ELEMENT_TYPES - 2) {
            exact.elements.push(external_element(
                QualifiedName::try_new(format!("example/element-{index}"))?,
                owner.clone(),
            ));
        }
        let exact_schema = compile(exact.clone(), CompilerLimits::default())?;
        assert_eq!(exact_schema.definition().elements.len(), MAX_ELEMENT_TYPES as usize);

        exact
            .elements
            .push(external_element(QualifiedName::try_new("example/element-over-limit")?, owner));
        assert_eq!(
            compile(exact, CompilerLimits::default()),
            Err(SchemaCompilerError::TooManyElements {
                actual: MAX_ELEMENT_TYPES + 1,
                maximum: MAX_ELEMENT_TYPES,
            })
        );
        Ok(())
    }

    #[test]
    fn accepts_exact_format_limit_and_rejects_limit_plus_one() -> TestResult {
        let owner = external_owner("example/format-pack", 1)?;
        let mut exact = base_spec();
        for index in 0..(MAX_INLINE_FORMAT_TYPES - 1) {
            exact.inline_formats.push(external_format(
                QualifiedName::try_new(format!("example/format-{index}"))?,
                owner.clone(),
            ));
        }
        let exact_schema = compile(exact.clone(), CompilerLimits::default())?;
        assert_eq!(
            exact_schema.definition().inline_formats.len(),
            MAX_INLINE_FORMAT_TYPES as usize
        );

        exact
            .inline_formats
            .push(external_format(QualifiedName::try_new("example/format-over-limit")?, owner));
        assert_eq!(
            compile(exact, CompilerLimits::default()),
            Err(SchemaCompilerError::TooManyInlineFormats {
                actual: MAX_INLINE_FORMAT_TYPES + 1,
                maximum: MAX_INLINE_FORMAT_TYPES,
            })
        );
        Ok(())
    }

    #[test]
    fn base_text_capability_rejects_every_representable_structural_widening() -> TestResult {
        let base = super::compile_breditor_base();
        assert!(base.is_exact_breditor_base());
        assert!(base.supports_text_splice_operations());
        assert!(base.supports_paragraph_structure_operations());
        assert!(base.supports_base_text_operations());

        let owner = external_owner("example/capability-test", 1)?;
        let mut extra_element = base_spec();
        extra_element
            .elements
            .push(external_element(QualifiedName::try_new("example/aside")?, owner.clone()));

        let mut property_format = base_spec();
        let mut added_format =
            external_format(QualifiedName::try_new("example/link")?, owner.clone());
        added_format.property_contract = Some(property_contract(added_format.kind.clone())?);
        property_format.inline_formats.push(added_format);

        let mut strong_revision = base_spec();
        strong_revision.inline_formats[0].revision = PersistedTypeRevision::try_new(2)?;

        let mut strong_properties = base_spec();
        strong_properties.inline_formats[0].property_contract =
            Some(property_contract(strong_properties.inline_formats[0].kind.clone())?);

        let mut element_revision = base_spec();
        element_revision.elements[0].revision = PersistedTypeRevision::try_new(2)?;

        let mut root_properties = base_spec();
        root_properties.elements[0].allows_properties = true;

        let mut paragraph_entity = base_spec();
        paragraph_entity.elements[1].allows_entity_id = true;

        let mut changed_roles = base_spec();
        std::mem::swap(&mut changed_roles.root_kind, &mut changed_roles.paragraph_kind);

        let mut changed_child_range = base_spec();
        changed_child_range.elements[0].children.minimum = 2;

        let mut changed_child_kind = base_spec();
        changed_child_kind.elements[1].children.kind =
            ChildKind::Element(QualifiedName::from_known_static("breditor/paragraph"));

        for (label, spec, supports_structural_text) in [
            ("extra element", extra_element, false),
            ("property-bearing added format", property_format, true),
            ("strong revision", strong_revision, false),
            ("strong property policy", strong_properties, false),
            ("element revision", element_revision, false),
            ("root property policy", root_properties, false),
            ("paragraph entity policy", paragraph_entity, false),
            ("role assignment", changed_roles, false),
            ("child range", changed_child_range, false),
            ("child kind", changed_child_kind, false),
        ] {
            let schema = compile(spec, CompilerLimits::default())?;
            assert!(!schema.is_exact_breditor_base(), "{label} remained exact base");
            assert_eq!(
                schema.supports_text_splice_operations(),
                supports_structural_text,
                "{label} received the wrong paragraph-local splice capability"
            );
            assert_eq!(
                schema.supports_paragraph_structure_operations(),
                supports_structural_text,
                "{label} received the wrong paragraph-structure capability"
            );
            assert!(
                !schema.supports_base_text_operations(),
                "{label} received the sealed base-text capability"
            );
        }
        Ok(())
    }
}
