//! Closed explicit V4 image-link intent: one image, one canonical target or `null` to clear.
use super::JsonFailure;
use crate::{
    rich_content::{ImageId, RichImageHref, RichImageLink, RichImageLinkError},
    state::EditorContext,
};
use serde::{Deserialize, Deserializer};

/// Payload-free or bounded diagnostic failure for native image-link intent.
#[derive(Debug, thiserror::Error)]
pub enum RichImageLinkCodecError {
    /// Old profiles never acquire link semantics through an untrusted payload.
    #[error("image links require the explicit rich V4 context")]
    UnsupportedContext,
    /// Complete input exceeds the independent 8 KiB boundary.
    #[error("image link payload exceeds its byte budget")]
    Limit,
    /// Strict decoding failed.
    #[error(transparent)]
    Json(#[from] JsonFailure),
    /// A native identity, target or flag combination was rejected.
    #[error(transparent)]
    Value(#[from] RichImageLinkError),
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Request {
    image: String,
    #[serde(deserialize_with = "nullable")]
    href: Option<String>,
    #[serde(default, rename = "newWindow", deserialize_with = "present")]
    new_window: Option<bool>,
}
/// `href` is required; `null` is its explicit clear value.
fn nullable<'de, D: Deserializer<'de>>(d: D) -> Result<Option<String>, D::Error> {
    Option::<String>::deserialize(d)
}
/// A present field must hold its value; `null` is not a synonym for keep.
fn present<'de, D: Deserializer<'de>, T: Deserialize<'de>>(d: D) -> Result<Option<T>, D::Error> {
    T::deserialize(d).map(Some)
}

/// Decode one target image and its complete link intent.
///
/// `{"image": id, "href": url, "newWindow"?: bool}` sets or replaces the link;
/// `{"image": id, "href": null}` removes it (`newWindow` must then be absent).
/// `href` must already be the canonical spelling: no case folding, port,
/// dot-segment or percent-encoding repair is performed here.
/// # Errors
/// Rejects non-V4 context, unknown/duplicate fields, wrong types, a non-canonical
/// or unsafe target, `newWindow` with a clear, invalid identities and byte budgets.
pub fn decode_rich_image_link_command(
    context: &EditorContext,
    input: &str,
) -> Result<(ImageId, Option<RichImageLink>), RichImageLinkCodecError> {
    if !context.schema().supports_rich_image_links() {
        return Err(RichImageLinkCodecError::UnsupportedContext);
    }
    if input.len() > 8 * 1024 {
        return Err(RichImageLinkCodecError::Limit);
    }
    let r: Request = serde_json::from_str(input).map_err(|e| JsonFailure::from_serde(&e))?;
    let image = ImageId::try_new(r.image).map_err(|_| RichImageLinkError::Target)?;
    let link = match (r.href, r.new_window) {
        (None, None) => None,
        (None, Some(_)) => return Err(RichImageLinkError::Value.into()),
        (Some(href), new_window) => {
            Some(RichImageLink::new(RichImageHref::try_new(href)?, new_window.unwrap_or(false)))
        }
    };
    Ok((image, link))
}
