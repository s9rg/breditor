//! Explicit candidate V4 image links: URL policy, decorative rule, actions, history and clipboard.
#![cfg(feature = "experimental-rich-content")]
#[path = "support/coverage_fixture.rs"]
#[allow(dead_code)]
mod fixture;
use breditor_core::{
    codec::{
        DocumentJsonCodecV2, RichClipboardJsonCodec, RichSessionJsonCodec,
        decode_rich_image_link_command,
    },
    extension::{ExtensionLimits, ExtensionSet},
    identity::QualifiedName,
    position::{Affinity, TextOffset},
    rich_content::{
        BlockId, CausalStamp, ChangeId, ImageAlt, ImageId, ReplicaId, RichClipboardError,
        RichClipboardFragment, RichClipboardIdAllocator, RichClipboardIdentityKind, RichDocument,
        RichFlowParent, RichFlowPosition, RichImageHref, RichImageLink, RichImageLinkError,
        RichLocalOutcome, RichLocalSession, RichSelection, RichSelectionKind, RichSelectionUpdate,
        RichTextPoint,
        actions::{
            InsertBlocks, ResizeImage, RichAction, RichActionError, SetImageAlt, SetImageLink,
        },
        standard_inline_extension_v1,
    },
    schema::{CompiledSchema, DocumentLimits, SchemaId, SchemaVersion},
    session::HistoryCapacity,
    state::EditorContext,
};
use serde_json::{Value, json};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;

/// Candidate V4 fingerprint for schema `example/layout@1` with the standard inline preset,
/// pinned since the collapsible-section slice (`breditor/image` stays persisted type revision 2).
const V4_FINGERPRINT: &str =
    "sha256:e63bb6521acb5c4e0104e35c3a2a896be442b6f2ee183c3c749c5a669b278a99";

fn schema(revision: u32) -> Result<CompiledSchema> {
    let id = SchemaId::new(QualifiedName::try_new("example/layout")?, SchemaVersion::try_new(1)?);
    let extensions =
        ExtensionSet::try_new(vec![standard_inline_extension_v1()], ExtensionLimits::default())?;
    Ok(match revision {
        1 => CompiledSchema::try_compile_rich_content_profile(id, &extensions)?,
        2 => CompiledSchema::try_compile_rich_content_profile_v2(id, &extensions)?,
        3 => CompiledSchema::try_compile_rich_content_profile_v3(id, &extensions)?,
        4 => CompiledSchema::try_compile_rich_content_profile_v4(id, &extensions)?,
        _ => return Err("revision".into()),
    })
}
fn context(revision: u32) -> Result<EditorContext> {
    Ok(EditorContext::new(schema(revision)?, DocumentLimits::default()))
}
fn admit(c: &EditorContext, root: &Value) -> Result<RichDocument> {
    let mut input = json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/layout","version":1},"schemaFingerprint":c.schema().fingerprint().to_string(),"root":null});
    input["root"] = root.clone();
    Ok(RichDocument::try_admit(
        c.schema(),
        DocumentJsonCodecV2::new(c.schema().clone()).decode(&input.to_string())?,
        c.limits(),
    )?)
}
fn encode(c: &EditorContext, d: &RichDocument) -> Result<Value> {
    Ok(serde_json::from_str::<Value>(
        &DocumentJsonCodecV2::new(c.schema().clone()).encode(d.document())?,
    )?["root"]
        .clone())
}
/// `p` paragraph, `fig` (image `img`, alt "Chart", caption `cap`), `deco` (decorative image `dimg`).
fn root_with(link: &[(&str, Value)]) -> Value {
    let mut image = fixture::element("image", "fig", vec![fixture::paragraph("cap", "Caption")]);
    image["properties"] = json!({"breditor/block-id":"fig","breditor/image-id":"img","breditor/asset-id":"asset","breditor/asset-generation":"gen","breditor/decorative":false,"breditor/alt-text":"Chart"});
    for (key, value) in link {
        image["properties"][format!("breditor/{key}")] = value.clone();
    }
    let mut deco = fixture::element("image", "deco", vec![]);
    deco["properties"] = json!({"breditor/block-id":"deco","breditor/image-id":"dimg","breditor/asset-id":"asset2","breditor/asset-generation":"gen","breditor/decorative":true,"breditor/alt-text":""});
    let mut root = fixture::element(
        "document",
        "unused",
        vec![fixture::paragraph("p", "Hello"), image, deco, fixture::paragraph("q", "")],
    );
    root["properties"] = json!({"breditor/document-id":"room"});
    root
}
fn root() -> Value {
    root_with(&[])
}
fn image() -> Result<ImageId> {
    Ok(ImageId::try_new("img")?)
}
fn link(href: &str, new_window: bool) -> Result<RichImageLink> {
    Ok(RichImageLink::new(RichImageHref::try_new(href)?, new_window))
}
fn caret(block: &str) -> Result<RichSelectionKind> {
    let point = RichTextPoint::new(BlockId::try_new(block)?, TextOffset::ZERO, Affinity::After);
    Ok(RichSelectionKind::TextRange { anchor: point.clone(), focus: point })
}
fn owner(c: &EditorContext, raw: &Value) -> Result<RichLocalSession> {
    Ok(RichLocalSession::try_new(
        c.clone(),
        admit(c, raw)?,
        Some(RichSelectionKind::Node(BlockId::try_new("fig")?)),
        HistoryCapacity::default(),
    )?)
}
fn set(a: &mut RichLocalSession, value: Option<&RichImageLink>) -> Result<RichLocalOutcome> {
    let action = SetImageLink::capture(a.state().document(), &image()?, value)?;
    Ok(a.dispatch(&a.snapshot(), &[RichAction::SetImageLink(action)], RichSelectionUpdate::Map)?)
}
fn props(c: &EditorContext, a: &RichLocalSession) -> Result<Value> {
    Ok(encode(c, a.state().document())?["children"][1]["properties"].clone())
}

#[test]
fn v4_fingerprint_is_locked_and_v1_to_v3_stay_exact_without_links() -> Result {
    let [a, b, c, d] = [schema(1)?, schema(2)?, schema(3)?, schema(4)?];
    for (old, expected) in [
        (&a, "sha256:26dcb0992f0814e1d18491134f70c5857efc01b0c28d07015199490389090278"),
        (&b, "sha256:2082e440c52cdef30f9fa46289cae3e378ea7673f05d20e6b71bb5797347b056"),
        (&c, "sha256:6667773591bde52ef650c498d908ccbe7e8d9303683be0ab7c55400db6dd52b4"),
    ] {
        assert_eq!(old.fingerprint().to_string(), expected);
        assert!(!old.supports_rich_image_links());
    }
    // Candidate V4 changes as later slices land; this pins the image-link slice exactly.
    assert_eq!(d.fingerprint().to_string(), V4_FINGERPRINT);
    assert!(
        d.supports_rich_image_links()
            && d.supports_rich_text_language()
            && d.supports_rich_list_numbering()
    );
    Ok(())
}

#[test]
fn only_canonical_safe_targets_are_admitted_and_only_in_v4() -> Result {
    let c = context(4)?;
    // The same accept/reject table as the inline safeLinkV1 policy plus canonical storage.
    for good in [
        "https://example.com/",
        "http://example.com/docs/a%20b?q=1#top",
        "https://example.com:8443/x",
        "https://127.0.0.1/",
        "https://xn--bcher-kva.de/",
    ] {
        admit(&c, &root_with(&[("image-href", json!(good))]))?;
        admit(
            &c,
            &root_with(&[("image-href", json!(good)), ("image-link-new-window", json!(true))]),
        )?;
        assert_eq!(RichImageHref::try_new(good)?.as_str(), good);
        for revision in [1, 2, 3] {
            let old = context(revision)?;
            admit(&old, &root())?;
            assert!(admit(&old, &root_with(&[("image-href", json!(good))])).is_err());
        }
    }
    for bad in [
        "",
        "https://example.com",
        "HTTPS://EXAMPLE.COM/",
        "https://Example.com/",
        "javascript:alert(1)",
        "mailto:a@example.com",
        "data:image/png;base64,AA==",
        "ftp://example.com/",
        "/relative",
        "//example.com/",
        "https://user:pw@example.com/",
        "https://example.com:443/",
        "https://example.com/a b",
        "https://example.com/\"x\"",
        "https://example.com/<x>",
        "https://example.com\\x/",
        "https://example.com/./a",
        "https://bücher.de/",
    ] {
        assert!(admit(&c, &root_with(&[("image-href", json!(bad))])).is_err(), "{bad}");
        assert_eq!(RichImageHref::try_new(bad), Err(RichImageLinkError::Value), "{bad}");
    }
    let long = format!("https://example.com/{}", "a".repeat(2048 - 20));
    admit(&c, &root_with(&[("image-href", json!(long))]))?;
    assert!(admit(&c, &root_with(&[("image-href", json!(format!("{long}b")))])).is_err());
    // Non-string targets, non-canonical flags and a flag without a target are refused.
    for props in [
        vec![("image-href", json!(7))],
        vec![("image-href", Value::Null)],
        vec![
            ("image-href", json!("https://example.com/")),
            ("image-link-new-window", json!(false)),
        ],
        vec![("image-href", json!("https://example.com/")), ("image-link-new-window", json!(1))],
        vec![("image-link-new-window", json!(true))],
    ] {
        assert!(admit(&c, &root_with(&props)).is_err());
    }
    // Link properties belong only to images.
    let mut raw = root();
    raw["children"][0]["properties"]["breditor/image-href"] = json!("https://example.com/");
    assert!(admit(&c, &raw).is_err());
    Ok(())
}

#[test]
fn a_decorative_image_can_never_carry_a_link() -> Result {
    let c = context(4)?;
    let mut raw = root();
    raw["children"][2]["properties"]["breditor/image-href"] = json!("https://example.com/");
    assert!(admit(&c, &raw).is_err());
    let mut a = owner(&c, &root())?;
    let target = link("https://example.com/", false)?;
    let err =
        SetImageLink::capture(a.state().document(), &ImageId::try_new("dimg")?, Some(&target))
            .err()
            .ok_or("decorative link accepted")?;
    assert!(matches!(err, RichActionError::ImageLink(RichImageLinkError::Decorative)), "{err:?}");
    // Clearing a decorative image's (absent) link is an exact no-op.
    let clear = SetImageLink::capture(a.state().document(), &ImageId::try_new("dimg")?, None)?;
    assert_eq!(
        a.dispatch(&a.snapshot(), &[RichAction::SetImageLink(clear)], RichSelectionUpdate::Map)?,
        RichLocalOutcome::Unchanged
    );
    // Making a linked image decorative is refused by admission and publishes nothing.
    set(&mut a, Some(&target))?;
    let decorative = SetImageAlt::capture(a.state().document(), &image()?, ImageAlt::decorative())?;
    assert!(
        a.dispatch(&a.snapshot(), &[RichAction::SetImageAlt(decorative)], RichSelectionUpdate::Map)
            .is_err()
    );
    assert_eq!(props(&c, &a)?["breditor/decorative"], json!(false));
    assert_eq!(a.undo_depth(), 1);
    Ok(())
}

#[test]
fn set_replace_and_clear_are_single_history_groups_with_exact_undo_redo_and_restore() -> Result {
    let c = context(4)?;
    let mut a = owner(&c, &root())?;
    let original = encode(&c, a.state().document())?;
    let first = link("https://example.com/a", false)?;
    assert_eq!(set(&mut a, Some(&first))?, RichLocalOutcome::ContentCommitted);
    assert_eq!(a.undo_depth(), 1);
    let linked = encode(&c, a.state().document())?;
    assert_eq!(linked["children"][1]["properties"]["breditor/image-href"], "https://example.com/a");
    assert!(linked["children"][1]["properties"].get("breditor/image-link-new-window").is_none());
    // The caption, other blocks and every other image property are untouched.
    assert_eq!(linked["children"][1]["children"], original["children"][1]["children"]);
    assert_eq!(linked["children"][2], original["children"][2]);
    assert_eq!(RichImageLink::read(&c, a.state().document(), &image()?)?, Some(first.clone()));
    // An identical link is an admitted exact no-op.
    assert_eq!(set(&mut a, Some(&first))?, RichLocalOutcome::Unchanged);
    assert_eq!(a.undo_depth(), 1);
    // Replacing target and window intent is one more group.
    let second = link("https://example.org/b?x=1", true)?;
    assert_eq!(set(&mut a, Some(&second))?, RichLocalOutcome::ContentCommitted);
    assert_eq!(a.undo_depth(), 2);
    let replaced = encode(&c, a.state().document())?;
    assert_eq!(
        replaced["children"][1]["properties"]["breditor/image-link-new-window"],
        json!(true)
    );
    // Other image actions keep the link.
    let resize = ResizeImage::capture(
        a.state().document(),
        &image()?,
        Some(breditor_core::rich_content::ImageSize::try_new(40, 30)?),
    )?;
    a.dispatch(&a.snapshot(), &[RichAction::ResizeImage(resize)], RichSelectionUpdate::Map)?;
    assert_eq!(RichImageLink::read(&c, a.state().document(), &image()?)?, Some(second.clone()));
    a.undo(&a.snapshot())?;
    // A checkpoint restores the exact document and retained history.
    let codec = RichSessionJsonCodec::new(c.clone());
    let mut b = codec.decode(&codec.encode(&a)?)?;
    assert_eq!(encode(&c, b.state().document())?, replaced);
    b.undo(&b.snapshot())?;
    assert_eq!(encode(&c, b.state().document())?, linked);
    b.undo(&b.snapshot())?;
    assert_eq!(encode(&c, b.state().document())?, original);
    b.redo(&b.snapshot())?;
    b.redo(&b.snapshot())?;
    assert_eq!(encode(&c, b.state().document())?, replaced);
    // Clear removes both properties in one more group; clearing again is a no-op.
    assert_eq!(set(&mut a, None)?, RichLocalOutcome::ContentCommitted);
    assert_eq!(encode(&c, a.state().document())?, original);
    assert_eq!(set(&mut a, None)?, RichLocalOutcome::Unchanged);
    a.undo(&a.snapshot())?;
    assert_eq!(encode(&c, a.state().document())?, replaced);
    Ok(())
}

#[test]
fn read_only_stale_missing_and_old_profiles_refuse_atomically() -> Result {
    let c = context(4)?;
    let mut a = owner(&c, &root())?;
    let target = link("https://example.com/", false)?;
    assert!(SetImageLink::capture(a.state().document(), &ImageId::try_new("nope")?, None).is_err());
    a.set_read_only(&a.snapshot(), true)?;
    assert!(set(&mut a, Some(&target)).is_err());
    a.set_read_only(&a.snapshot(), false)?;
    let stale = a.snapshot();
    a.set_selection(&a.snapshot(), Some(caret("p")?))?;
    let action = SetImageLink::capture(a.state().document(), &image()?, Some(&target))?;
    assert!(
        a.dispatch(&stale, &[RichAction::SetImageLink(action)], RichSelectionUpdate::Map).is_err()
    );
    // A captured action is guarded against a changed source image.
    let captured = SetImageLink::capture(a.state().document(), &image()?, Some(&target))?;
    set(&mut a, Some(&link("https://example.com/other", false)?))?;
    assert!(captured.apply(&c, a.state().document()).is_err());
    assert_eq!(a.undo_depth(), 1);
    for revision in [1, 2, 3] {
        let old = context(revision)?;
        let b = owner(&old, &root())?;
        let action = SetImageLink::capture(b.state().document(), &image()?, Some(&target))?;
        let err = action.apply(&old, b.state().document()).err().ok_or("accepted")?;
        assert!(matches!(err, RichActionError::ImageLink(RichImageLinkError::Profile)));
        assert_eq!(
            RichImageLink::read(&old, b.state().document(), &image()?),
            Err(RichImageLinkError::Profile)
        );
        assert!(
            decode_rich_image_link_command(&old, r#"{"image":"img","href":"https://a.com/"}"#)
                .is_err()
        );
    }
    Ok(())
}

#[test]
fn command_decoding_is_strict_and_never_repairs_targets() -> Result {
    let c = context(4)?;
    let (id, value) = decode_rich_image_link_command(
        &c,
        r#"{"image":"img","href":"https://a.com/x","newWindow":true}"#,
    )?;
    assert_eq!(id, image()?);
    assert_eq!(value, Some(link("https://a.com/x", true)?));
    assert_eq!(
        decode_rich_image_link_command(&c, r#"{"image":"img","href":"https://a.com/"}"#)?.1,
        Some(link("https://a.com/", false)?)
    );
    assert_eq!(decode_rich_image_link_command(&c, r#"{"image":"img","href":null}"#)?.1, None);
    for bad in [
        r#"{"image":"img"}"#,
        r#"{"href":"https://a.com/"}"#,
        r#"{"image":"img","href":null,"newWindow":false}"#,
        r#"{"image":"img","href":"https://a.com/","newWindow":null}"#,
        r#"{"image":"img","href":"https://a.com/","extra":1}"#,
        r#"{"image":"img","href":"https://a.com/","href":"https://b.com/"}"#,
        r#"{"image":"img","href":"HTTPS://A.COM"}"#,
        r#"{"image":"img","href":"javascript:alert(1)"}"#,
        r#"{"image":"img","href":7}"#,
        r#"{"image":"","href":null}"#,
        r#"["img"]"#,
    ] {
        assert!(decode_rich_image_link_command(&c, bad).is_err(), "{bad}");
    }
    let long = format!(r#"{{"image":"img","href":null,"pad":"{}"}}"#, "x".repeat(8192));
    assert!(decode_rich_image_link_command(&c, &long).is_err());
    Ok(())
}

#[derive(Default)]
struct Ids(u64);
impl RichClipboardIdAllocator for Ids {
    fn next(
        &mut self,
        kind: RichClipboardIdentityKind,
    ) -> std::result::Result<String, RichClipboardError> {
        self.0 += 1;
        Ok(format!("paste-{kind:?}-{}", self.0))
    }
    fn merge_stamp(&mut self) -> std::result::Result<CausalStamp, RichClipboardError> {
        Ok(CausalStamp::new(
            1,
            ChangeId::new(ReplicaId::try_new(7).map_err(|_| RichClipboardError::Allocation)?, 1),
        ))
    }
}

#[test]
fn native_clipboard_copy_and_paste_keep_the_exact_link() -> Result {
    let c = context(4)?;
    let raw = root_with(&[
        ("image-href", json!("https://example.com/target")),
        ("image-link-new-window", json!(true)),
    ]);
    let d = admit(&c, &raw)?;
    let selection = RichSelection::try_new(&d, RichSelectionKind::Node(BlockId::try_new("fig")?))?;
    let fragment = RichClipboardFragment::copy_selection(&c, &d, &selection)?.ok_or("fragment")?;
    let json = RichClipboardJsonCodec::new(c.clone()).encode(&fragment)?;
    assert!(json.contains(r#""breditor/image-href":"https://example.com/target""#), "{json}");
    let decoded = RichClipboardJsonCodec::new(c.clone()).decode(&json)?;
    let drafts = decoded.flow_drafts(&c, &mut Ids::default())?;
    let action =
        InsertBlocks::capture(&d, &RichFlowPosition::new(RichFlowParent::Document, None), drafts)?;
    let mut a = owner(&c, &raw)?;
    a.dispatch(&a.snapshot(), &[RichAction::InsertBlocks(action)], RichSelectionUpdate::Map)?;
    assert_eq!(a.undo_depth(), 1);
    let pasted = encode(&c, a.state().document())?;
    let copy = pasted["children"]
        .as_array()
        .ok_or("children")?
        .iter()
        .filter(|n| n["type"] == "breditor/image" && n["properties"]["breditor/image-id"] != "img")
        .find(|n| n["properties"]["breditor/image-href"] == "https://example.com/target")
        .ok_or("pasted linked image")?;
    assert_eq!(copy["properties"]["breditor/image-link-new-window"], json!(true));
    // A V3 owner refuses the V4 fragment that carries the link outright.
    assert!(RichClipboardJsonCodec::new(context(3)?).decode(&json).is_err());
    Ok(())
}
