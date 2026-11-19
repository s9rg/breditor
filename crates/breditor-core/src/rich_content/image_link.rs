//! Bounded image links of the explicit candidate rich V4.
//!
//! A link wraps one image only (never its caption). Its target is one absolute
//! HTTP(S) URL in the exact canonical spelling a WHATWG URL parser serializes,
//! restricted to a closed subset that is safe to emit verbatim as an HTML
//! attribute. The policy is the inline `safeLinkV1` link policy (HTTP/HTTPS only,
//! no credentials, no whitespace, controls or backslashes, at most 2,048 UTF-8
//! bytes) with canonical storage enforced natively: every admitted value is
//! already its own canonical serialization, so equal targets compare equal byte
//! for byte. Browser boundaries canonicalize with the same `safeLinkV1`
//! canonicalizer before sending intent; this owner remains authoritative.
//!
//! A linked image needs an accessible name, so a decorative image (empty alt)
//! can never carry a link.
use super::{ImageId, RichDocument};
use crate::{
    document::{ElementNode, PropertyValue},
    identity::QualifiedName,
    state::EditorContext,
};

/// AST key of the optional canonical link target.
pub(crate) const HREF: &str = "image-href";
/// AST key of the optional new-window flag; only literal `true` is canonical.
pub(crate) const NEW_WINDOW: &str = "image-link-new-window";
/// Inclusive UTF-8 ceiling, identical to the inline `safeLinkV1` link policy.
pub const RICH_IMAGE_LINK_HREF_MAX_BYTES: usize = 2048;

/// Payload-free image-link admission failure.
#[derive(Clone, Copy, Debug, Eq, PartialEq, thiserror::Error)]
pub enum RichImageLinkError {
    /// The explicit rich V4 candidate profile is required; old profiles never widen.
    #[error("image links require the explicit rich V4 profile")]
    Profile,
    /// Links belong only to an existing image node.
    #[error("image link requires an image")]
    Target,
    /// The target is not a canonical safe HTTP(S) URL, or a flag is non-canonical.
    #[error("invalid bounded image link value")]
    Value,
    /// A decorative image has no accessible name, so it cannot be a link.
    #[error("a decorative image cannot carry a link")]
    Decorative,
}

/// One admitted canonical, credential-free absolute HTTP(S) link target.
#[derive(Clone, Debug, Eq, PartialEq, Ord, PartialOrd, Hash)]
pub struct RichImageHref(String);

impl RichImageHref {
    /// Admit one already canonical target.
    ///
    /// No repair is attempted: uppercase scheme or host, default ports, dot
    /// segments, raw spaces, quotes, angle brackets, backslashes, credentials and
    /// any non-ASCII character are rejected rather than rewritten.
    /// # Errors
    /// Returns [`RichImageLinkError::Value`] for anything outside the canonical subset.
    pub fn try_new(value: impl Into<String>) -> Result<Self, RichImageLinkError> {
        let value = value.into();
        if is_canonical_href(&value) { Ok(Self(value)) } else { Err(RichImageLinkError::Value) }
    }
    /// Exact canonical target.
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// Exact admitted link of one image.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RichImageLink {
    href: RichImageHref,
    new_window: bool,
}

impl RichImageLink {
    /// Combine one admitted target with its explicit new-window intent.
    #[must_use]
    pub const fn new(href: RichImageHref, new_window: bool) -> Self {
        Self { href, new_window }
    }
    /// Canonical target.
    #[must_use]
    pub const fn href(&self) -> &RichImageHref {
        &self.href
    }
    /// Whether activation opens a new browsing context (`target="_blank"`).
    #[must_use]
    pub const fn new_window(&self) -> bool {
        self.new_window
    }
    /// Read one image's exact link; `None` means the image is not linked.
    pub(crate) fn from_node(node: &ElementNode) -> Result<Option<Self>, RichImageLinkError> {
        if !supports_kind(node.kind().as_str()) {
            return Err(RichImageLinkError::Target);
        }
        let new_window = match super::ast_properties::property(node, NEW_WINDOW) {
            None => false,
            Some(value) if value.as_boolean() == Some(true) => true,
            Some(_) => return Err(RichImageLinkError::Value),
        };
        let Some(value) = super::ast_properties::property(node, HREF) else {
            return if new_window { Err(RichImageLinkError::Value) } else { Ok(None) };
        };
        let href = RichImageHref::try_new(value.as_string().ok_or(RichImageLinkError::Value)?)?;
        if super::ast_properties::property(node, "decorative").and_then(PropertyValue::as_boolean)
            != Some(false)
        {
            return Err(RichImageLinkError::Decorative);
        }
        Ok(Some(Self { href, new_window }))
    }
    /// Read one admitted image's link under its exact explicit rich V4 context.
    /// # Errors
    /// Rejects incompatible profile/proof/limits and absent images.
    pub fn read(
        context: &EditorContext,
        document: &RichDocument,
        image: &ImageId,
    ) -> Result<Option<Self>, RichImageLinkError> {
        if !context.schema().supports_rich_image_links()
            || !document.document().is_proven_for(context.schema(), context.limits())
        {
            return Err(RichImageLinkError::Profile);
        }
        let path = document.image_path(image).ok_or(RichImageLinkError::Target)?;
        let node = document.document().node_at(path).map_err(|_| RichImageLinkError::Target)?;
        Self::from_node(node.as_element().ok_or(RichImageLinkError::Target)?)
    }
    /// Complete replacement properties; `None` removes both link properties.
    pub(crate) fn properties(link: Option<&Self>) -> [(&'static str, Option<PropertyValue>); 2] {
        [
            (HREF, link.map(|link| PropertyValue::from_string(link.href.as_str()))),
            (NEW_WINDOW, link.filter(|link| link.new_window).map(|_| PropertyValue::boolean(true))),
        ]
    }
}

pub(crate) fn supports_kind(kind: &str) -> bool {
    kind == "breditor/image"
}

pub(crate) fn allows_property(kind: &str, name: &QualifiedName) -> bool {
    supports_kind(kind)
        && name.namespace() == "breditor"
        && matches!(name.local_name(), HREF | NEW_WINDOW)
}

/// Complete-tree value law for V4 link properties on one image.
pub(crate) fn validate(node: &ElementNode) -> Result<(), &'static str> {
    match RichImageLink::from_node(node) {
        Ok(_) => Ok(()),
        Err(RichImageLinkError::Decorative) => Err("a decorative image cannot carry a link"),
        Err(_) => Err("invalid bounded image link value"),
    }
}

/// Whether `value` is a canonical safe absolute HTTP(S) URL in the closed subset.
///
/// The grammar (all ASCII, at most 2,048 bytes):
///
/// ```text
/// href      = ("http" / "https") "://" host [":" port] path ["?" query] ["#" fragment]
/// host      = ipv4 / domain                     ; lowercase, no empty label, no trailing dot
/// ipv4      = dec "." dec "." dec "." dec       ; 0-255, no leading zero
/// domain    = label *("." label)                ; label = 1*(a-z / 0-9 / "-" / "_"),
///                                               ; final label not all digits or 0x…
/// port      = 0-65535, no leading zero, never the scheme default (80 / 443)
/// path      = "/" segments                      ; no ".", "..", "%2e" dot segments
/// pchar     = ALPHA / DIGIT / "-._~!$&'()*+,;=:@" / pct-encoded
/// query     = *(pchar / "/" / "?")             ; except "'" (special-query escaped)
/// fragment  = *(pchar / "/" / "?")
/// ```
///
/// Each admitted value is its own WHATWG URL serialization (the parser leaves
/// it byte-for-byte unchanged), so no canonicalizer is needed for admission.
pub(crate) fn is_canonical_href(value: &str) -> bool {
    if value.is_empty() || value.len() > RICH_IMAGE_LINK_HREF_MAX_BYTES || !value.is_ascii() {
        return false;
    }
    let (rest, default_port) = if let Some(rest) = value.strip_prefix("https://") {
        (rest, 443)
    } else if let Some(rest) = value.strip_prefix("http://") {
        (rest, 80)
    } else {
        return false;
    };
    let authority_end = rest.find(['/', '?', '#']).unwrap_or(rest.len());
    let (authority, rest) = rest.split_at(authority_end);
    let (host, port) = match authority.split_once(':') {
        Some((host, port)) => (host, Some(port)),
        None => (authority, None),
    };
    if !valid_host(host) || port.is_some_and(|port| !valid_port(port, default_port)) {
        return false;
    }
    // A special URL always serializes a path, at least "/".
    let Some(rest) = rest.strip_prefix('/') else { return false };
    let (before_fragment, fragment) = match rest.split_once('#') {
        Some((before, fragment)) => (before, Some(fragment)),
        None => (rest, None),
    };
    let (path, query) = match before_fragment.split_once('?') {
        Some((path, query)) => (path, Some(query)),
        None => (before_fragment, None),
    };
    path.split('/').all(valid_segment)
        && query.is_none_or(|query| valid_chars(query, |byte| byte != b'\'' && query_char(byte)))
        && fragment.is_none_or(|fragment| valid_chars(fragment, query_char))
}

const fn query_char(byte: u8) -> bool {
    matches!(byte, b'/' | b'?') || pchar(byte)
}

const fn pchar(byte: u8) -> bool {
    byte.is_ascii_alphanumeric()
        || matches!(
            byte,
            b'-' | b'.'
                | b'_'
                | b'~'
                | b'!'
                | b'$'
                | b'&'
                | b'\''
                | b'('
                | b')'
                | b'*'
                | b'+'
                | b','
                | b';'
                | b'='
                | b':'
                | b'@'
        )
}

/// Every byte is allowed and every `%` starts a complete two-digit escape.
fn valid_chars(value: &str, allowed: impl Fn(u8) -> bool) -> bool {
    let bytes = value.as_bytes();
    let mut index = 0;
    while let Some(&byte) = bytes.get(index) {
        if byte == b'%' {
            let escape = bytes.get(index + 1..index + 3);
            if !escape.is_some_and(|pair| pair.iter().all(u8::is_ascii_hexdigit)) {
                return false;
            }
            index += 3;
        } else if allowed(byte) {
            index += 1;
        } else {
            return false;
        }
    }
    true
}

fn valid_segment(segment: &str) -> bool {
    let lower = segment.to_ascii_lowercase();
    !matches!(lower.as_str(), "." | ".." | "%2e" | ".%2e" | "%2e." | "%2e%2e")
        && valid_chars(segment, pchar)
}

fn valid_port(port: &str, default_port: u32) -> bool {
    if port.is_empty() || port.len() > 5 || !port.bytes().all(|byte| byte.is_ascii_digit()) {
        return false;
    }
    if port.len() > 1 && port.starts_with('0') {
        return false;
    }
    port.parse::<u32>().is_ok_and(|value| value <= 65_535 && value != default_port)
}

fn valid_host(host: &str) -> bool {
    if host.is_empty() {
        return false;
    }
    let labels: Vec<&str> = host.split('.').collect();
    if labels.iter().any(|label| {
        label.is_empty()
            || !label.bytes().all(|byte| {
                byte.is_ascii_lowercase() || byte.is_ascii_digit() || matches!(byte, b'-' | b'_')
            })
    }) {
        return false;
    }
    let last = labels.last().copied().unwrap_or_default();
    // A host whose final label is numeric is an IPv4 address to a URL parser.
    let numeric = last.bytes().all(|byte| byte.is_ascii_digit()) || last.starts_with("0x");
    if !numeric {
        return true;
    }
    labels.len() == 4
        && labels.iter().all(|label| {
            label.bytes().all(|byte| byte.is_ascii_digit())
                && (label.len() == 1 || !label.starts_with('0'))
                && label.parse::<u16>().is_ok_and(|value| value <= 255)
        })
}

#[cfg(test)]
mod tests {
    use super::is_canonical_href;

    #[test]
    fn canonical_subset_accepts_only_fixed_point_safe_targets() {
        for good in [
            "https://example.com/",
            "http://example.com/",
            "https://a/",
            "https://www.example.com/path/to/page.html",
            "https://example.com/a%20b?q=1&r=two#frag",
            "https://example.com/?",
            "https://example.com/#",
            "https://example.com:8080/",
            "http://example.com:443/",
            "https://example.com:0/",
            "https://127.0.0.1/",
            "https://255.255.255.255/x",
            "https://xn--bcher-kva.de/",
            "https://sub_domain.example-site.co/",
            "https://example.com/it's/ok",
            "https://example.com/a?x=/y?z",
            "https://example.com/#a/b?c",
            "https://example.com//double",
            "https://example.com/...",
        ] {
            assert!(is_canonical_href(good), "{good}");
        }
        let long = format!("https://example.com/{}", "a".repeat(2048 - 20));
        assert_eq!(long.len(), 2048);
        assert!(is_canonical_href(&long));
        for bad in [
            "",
            "https://example.com",
            "HTTPS://example.com/",
            "https://Example.com/",
            "ftp://example.com/",
            "javascript:alert(1)",
            "mailto:someone@example.com",
            "data:text/html,x",
            "//example.com/",
            "/relative",
            "https:///x",
            "https://user:pass@example.com/",
            "https://user@example.com/",
            "https://example.com:443/",
            "http://example.com:80/",
            "https://example.com:/",
            "https://example.com:08/",
            "https://example.com:65536/",
            "https://exa%6dple.com/",
            "https://example..com/",
            "https://example.com./",
            "https://127.1/",
            "https://01.2.3.4/",
            "https://256.1.1.1/",
            "https://example.123/",
            "https://0x7f/",
            "https://[::1]/",
            "https://example.com/a b",
            "https://example.com/a\tb",
            "https://example.com\\evil/",
            "https://example.com/a\\b",
            "https://example.com/\"quote\"",
            "https://example.com/<tag>",
            "https://example.com/`tick`",
            "https://example.com/{brace}",
            "https://example.com/a|b",
            "https://example.com/a^b",
            "https://example.com/./a",
            "https://example.com/a/..",
            "https://example.com/%2E%2e/a",
            "https://example.com/%zz",
            "https://example.com/%2",
            "https://example.com/?q='x'",
            "https://example.com/#a#b",
            "https://example.com/é",
        ] {
            assert!(!is_canonical_href(bad), "{bad}");
        }
        assert!(!is_canonical_href(&format!("{long}a")));
    }
}
