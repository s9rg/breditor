//! Application-selected schemas, typed formats and tightened budgets own no shared room state.
use breditor_collab_feasibility::rich_replica::{Command, SharedRichProfile, actions::InsertText};
use breditor_core::{
    extension::{
        ExtensionId, ExtensionLimits, ExtensionManifest, ExtensionSet, ExtensionVersion,
        InlineFormatPropertyContractV1, InlineFormatPropertySpecV1, InlineFormatPropertyTypeV1,
        InlineFormatSpecV1, PropertyPresenceV1,
    },
    identity::QualifiedName,
    schema::{CompiledSchema, DocumentLimits, PersistedTypeRevision, SchemaId, SchemaVersion},
};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
fn config() -> Value {
    json!({"format":"breditor/shared-rich-profile","formatVersion":1,"schema":{"name":"example/shared-product","version":7},"extensions":[{
    "id":{"name":"example/links","version":1},"dependencies":[],"conflicts":[],"formats":[{
        "kind":"example/link","revision":2,"properties":[{"name":"example/href","presence":"required","valueType":{"kind":"string","minimumUtf8Bytes":1,"maximumUtf8Bytes":2000}}]
    }]}]})
}
fn profile() -> Result<SharedRichProfile> {
    Ok(SharedRichProfile::from_configuration_json(&config().to_string())?)
}
fn input(profile: &SharedRichProfile) -> Result<String> {
    let schema = profile.schema();
    let mut root: Value = serde_json::from_str(include_str!(
        "../../../crates/breditor-core/tests/fixtures/rich-local-root.json"
    ))?;
    root["children"][0]["children"][0]["children"][0]["children"][0]["children"][0]["formats"] =
        json!([{"type":"example/link","properties":{"example/href":"https://example.test/"}}]);
    Ok(json!({"format":"breditor/document","formatVersion":2,"schema":{"name":schema.id().name().as_str(),"version":schema.id().version().get()},"schemaFingerprint":schema.fingerprint().to_string(),"root":root}).to_string())
}
fn insert(text: &str) -> Command {
    Command::InsertText(InsertText { block: "p".into(), offset: 0, text: text.into() })
}

#[test]
fn json_configuration_matches_an_independently_compiled_typed_schema() -> Result {
    let id = SchemaId::new(
        QualifiedName::try_new("example/shared-product")?,
        SchemaVersion::try_new(7)?,
    );
    let kind = QualifiedName::try_new("example/link")?;
    let manifest = ExtensionManifest::try_new_with_inline_formats_and_property_contracts(
        ExtensionId::new(QualifiedName::try_new("example/links")?, ExtensionVersion::try_new(1)?),
        vec![],
        vec![],
        vec![InlineFormatSpecV1::new(kind.clone(), PersistedTypeRevision::try_new(2)?)],
        vec![InlineFormatPropertyContractV1::try_new(
            kind,
            vec![InlineFormatPropertySpecV1::new(
                QualifiedName::try_new("example/href")?,
                PropertyPresenceV1::Required,
                InlineFormatPropertyTypeV1::try_string(1, 2000)?,
            )],
        )?],
    )?;
    let schema = CompiledSchema::try_compile_rich_content_profile(
        id,
        &ExtensionSet::try_new(vec![manifest], ExtensionLimits::default())?,
    )?;
    let native = SharedRichProfile::from_schema(schema, DocumentLimits::default())?;
    assert_eq!(native.schema().fingerprint(), profile()?.schema().fingerprint());
    assert_eq!(native.descriptor_json(), profile()?.descriptor_json());
    Ok(())
}

#[test]
fn custom_formats_survive_shared_edits_selective_history_and_exact_factory_restore() -> Result {
    let profile = profile()?;
    let mut a = profile.create(&input(&profile)?, "9007199254740993".into())?;
    let mut b = profile.join_frame("room".into(), "9007199254740995".into(), &a.update_frame()?)?;
    a.apply(vec![insert("Local ")])?;
    b.apply(vec![Command::InsertText(InsertText {
        block: "caption".into(),
        offset: 0,
        text: "Remote ".into(),
    })])?;
    let (x, y) = (a.update_frame()?, b.update_frame()?);
    a.receive_frame(&y)?;
    b.receive_frame(&x)?;
    assert_eq!(a.document_json(), b.document_json());
    assert!(a.document_json().contains("example/link"));
    let mut restored = profile.restore("room", &a.checkpoint()?)?;
    for _ in 0..3 {
        a.undo()?;
        restored.undo()?;
        assert_eq!(a.checkpoint()?, restored.checkpoint()?);
        a.redo()?;
        restored.redo()?;
        assert_eq!(a.checkpoint()?, restored.checkpoint()?);
    }
    Ok(())
}

#[test]
fn owners_retain_the_compiled_grammar_after_the_factory_is_dropped() -> Result {
    let mut a = {
        let p = profile()?;
        p.create(&input(&p)?, "1".into())?
    };
    a.apply(vec![insert("Independent ")])?;
    a.undo()?;
    a.redo()?;
    let p = profile()?;
    let restored = p.restore("room", &a.checkpoint()?)?;
    assert_eq!(a.document_json(), restored.document_json());
    assert_eq!(a.checkpoint()?, restored.checkpoint()?);
    Ok(())
}

#[test]
fn same_schema_id_with_a_different_typed_contract_cannot_join_or_restore() -> Result {
    let p = profile()?;
    let a = p.create(&input(&p)?, "1".into())?;
    let mut changed = config();
    changed["extensions"][0]["formats"][0]["properties"][0]["valueType"]["maximumUtf8Bytes"] =
        json!(1000);
    let other = SharedRichProfile::from_configuration_json(&changed.to_string())?;
    assert_ne!(p.schema().fingerprint(), other.schema().fingerprint());
    assert!(other.join_frame("room".into(), "2".into(), &a.update_frame()?).is_err());
    assert!(other.restore("room", &a.checkpoint()?).is_err());
    assert!(other.create(&input(&p)?, "2".into()).is_err());
    Ok(())
}

#[test]
fn tightened_budgets_apply_to_initial_content_local_changes_receive_and_recovery() -> Result {
    let p = profile()?;
    let input = input(&p)?;
    let mut conf = config();
    conf["limits"] = json!({"maxTextBytes":32});
    let small = SharedRichProfile::from_configuration_json(&conf.to_string())?;
    let mut a = small.create(&input, "1".into())?;
    let before = a.checkpoint()?;
    assert!(a.apply(vec![insert(&"x".repeat(40))]).is_err());
    assert_eq!(a.checkpoint()?, before);
    let mut b = p.join_frame("room".into(), "2".into(), &a.update_frame()?)?;
    b.apply(vec![insert(&"x".repeat(40))])?;
    assert!(a.receive_frame(&b.update_frame()?).is_err());
    assert_eq!(a.checkpoint()?, before);
    assert!(small.restore("room", &b.checkpoint()?).is_err());
    conf["limits"] = json!({"maxTextBytes":1});
    assert!(
        SharedRichProfile::from_configuration_json(&conf.to_string())?
            .create(&input, "3".into())
            .is_err()
    );
    assert!(
        SharedRichProfile::from_schema(
            p.schema().clone(),
            DocumentLimits::default().with_max_nodes(100_001)
        )
        .is_err()
    );
    assert!(
        SharedRichProfile::from_schema(CompiledSchema::breditor_base(), DocumentLimits::default())
            .is_err()
    );
    Ok(())
}

#[test]
fn strict_configuration_rejects_unknown_wrong_and_duplicate_fields() {
    let mut cases = Vec::new();
    for (field, value) in [
        ("format", json!("breditor/profile-bootstrap")),
        ("formatVersion", json!(6)),
        ("unexpected", json!(true)),
    ] {
        let mut c = config();
        c[field] = value;
        cases.push(c.to_string());
    }
    let mut c = config();
    c["schema"]["version"] = json!(0);
    cases.push(c.to_string());
    let mut c = config();
    c["schema"]["extra"] = json!(true);
    cases.push(c.to_string());
    let mut c = config();
    c["limits"] = json!({"maxNodes":100_001});
    cases.push(c.to_string());
    let mut c = config();
    c["limits"] = json!({"unknown":1});
    cases.push(c.to_string());
    cases.push(config().to_string().replacen(
        "\"formatVersion\":1",
        "\"formatVersion\":1,\"formatVersion\":1",
        1,
    ));
    for case in cases {
        assert!(SharedRichProfile::from_configuration_json(&case).is_err(), "{case}");
    }
}

#[test]
fn extension_dependencies_and_typed_property_contracts_are_compiler_checked() -> Result {
    let mut c = config();
    let ext = c["extensions"][0].clone();
    c["extensions"].as_array_mut().ok_or("extensions")?.push(ext);
    assert!(SharedRichProfile::from_configuration_json(&c.to_string()).is_err());
    let mut c = config();
    c["extensions"][0]["dependencies"] = json!([{"name":"example/missing","version":1}]);
    assert!(SharedRichProfile::from_configuration_json(&c.to_string()).is_err());
    let mut c = config();
    c["extensions"][0]["formats"][0]["kind"] = json!("breditor/strong");
    assert!(SharedRichProfile::from_configuration_json(&c.to_string()).is_err());
    let mut c = config();
    c["extensions"][0]["formats"][0]["properties"][0]["valueType"] =
        json!({"kind":"integer","minimum":2,"maximum":1});
    assert!(SharedRichProfile::from_configuration_json(&c.to_string()).is_err());
    let mut c = config();
    c["extensions"][0]["formats"][0]["properties"][0]["valueType"] =
        json!({"kind":"integer","minimum":null});
    assert!(SharedRichProfile::from_configuration_json(&c.to_string()).is_err());
    Ok(())
}

#[test]
fn bounded_configuration_fails_without_allocating_or_echoing_unbounded_manifest_payloads() -> Result
{
    let mut c = config();
    c["extensions"] = json!(vec![c["extensions"][0].clone(); 65]);
    assert!(SharedRichProfile::from_configuration_json(&c.to_string()).is_err());
    let mut c = config();
    c["extensions"][0]["formats"] = json!(vec![c["extensions"][0]["formats"][0].clone(); 256]);
    assert!(SharedRichProfile::from_configuration_json(&c.to_string()).is_err());
    let mut c = config();
    c["extensions"][0]["formats"][0]["properties"] =
        json!(vec![c["extensions"][0]["formats"][0]["properties"][0].clone(); 33]);
    assert!(SharedRichProfile::from_configuration_json(&c.to_string()).is_err());
    let oversized = "sensitive-host-payload".repeat(50_000);
    let error = SharedRichProfile::from_configuration_json(&oversized).err().ok_or("limit")?;
    assert_eq!(error.to_string(), "feasibility budget exceeded: shared profile JSON bytes");
    Ok(())
}
