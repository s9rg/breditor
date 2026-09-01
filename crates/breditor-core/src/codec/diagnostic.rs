use std::{
    fmt::{self, Write as _},
    sync::Arc,
};

/// Maximum number of UTF-8 bytes retained in an untrusted diagnostic preview.
///
/// A preview may be shorter when this byte boundary would split a Unicode
/// scalar value. The original byte length remains available separately.
pub const MAX_DIAGNOSTIC_PREVIEW_BYTES: usize = 256;

/// A bounded, immutable preview of text used only for human diagnostics.
///
/// Codec errors can originate in untrusted JSON. This value prevents those
/// errors from retaining an attacker-controlled string in full while still
/// recording its original UTF-8 byte length. The preview is always a valid
/// UTF-8 prefix no longer than [`MAX_DIAGNOSTIC_PREVIEW_BYTES`].
///
/// [`fmt::Display`] escapes control characters so one diagnostic cannot inject
/// extra log lines. When the preview is truncated, the display also reports the
/// original byte length. Engine control flow must use stable error codes and
/// typed fields, never this text.
#[derive(Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct BoundedDiagnostic {
    preview: Arc<str>,
    original_byte_len: usize,
}

impl BoundedDiagnostic {
    /// Captures a bounded preview of `value`.
    #[must_use]
    pub fn new(value: impl AsRef<str>) -> Self {
        Self::from_borrowed(value.as_ref())
    }

    /// Returns the retained valid-UTF-8 prefix.
    #[must_use]
    pub fn preview(&self) -> &str {
        &self.preview
    }

    /// Returns the original string's complete UTF-8 byte length.
    #[must_use]
    pub const fn original_byte_len(&self) -> usize {
        self.original_byte_len
    }

    /// Reports whether any bytes were omitted from the preview.
    #[must_use]
    pub fn is_truncated(&self) -> bool {
        self.preview.len() < self.original_byte_len
    }

    fn from_borrowed(value: &str) -> Self {
        let original_byte_len = value.len();
        let preview_end = preview_end(value);
        Self { preview: Arc::from(&value[..preview_end]), original_byte_len }
    }

    fn from_owned(mut value: String) -> Self {
        let original_byte_len = value.len();
        value.truncate(preview_end(&value));
        Self { preview: Arc::from(value.into_boxed_str()), original_byte_len }
    }
}

impl AsRef<str> for BoundedDiagnostic {
    fn as_ref(&self) -> &str {
        self.preview()
    }
}

impl From<&str> for BoundedDiagnostic {
    fn from(value: &str) -> Self {
        Self::from_borrowed(value)
    }
}

impl From<String> for BoundedDiagnostic {
    fn from(value: String) -> Self {
        Self::from_owned(value)
    }
}

impl fmt::Display for BoundedDiagnostic {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        for character in self.preview.chars() {
            for escaped in character.escape_debug() {
                formatter.write_char(escaped)?;
            }
        }
        if self.is_truncated() {
            write!(formatter, "… [truncated from {} UTF-8 bytes]", self.original_byte_len)?;
        }
        Ok(())
    }
}

fn preview_end(value: &str) -> usize {
    let mut end = value.len().min(MAX_DIAGNOSTIC_PREVIEW_BYTES);
    while !value.is_char_boundary(end) {
        end -= 1;
    }
    end
}

#[cfg(test)]
mod tests {
    use super::{BoundedDiagnostic, MAX_DIAGNOSTIC_PREVIEW_BYTES};

    #[test]
    fn short_text_is_preserved_without_truncation() {
        let diagnostic = BoundedDiagnostic::new("useful context");

        assert_eq!(diagnostic.preview(), "useful context");
        assert_eq!(diagnostic.original_byte_len(), 14);
        assert!(!diagnostic.is_truncated());
        assert_eq!(diagnostic.to_string(), "useful context");
    }

    #[test]
    fn owned_text_is_truncated_at_a_utf8_boundary() {
        let text = format!("{}étail", "a".repeat(MAX_DIAGNOSTIC_PREVIEW_BYTES - 1));
        let original_byte_len = text.len();
        let diagnostic = BoundedDiagnostic::from(text);

        assert_eq!(diagnostic.preview(), "a".repeat(MAX_DIAGNOSTIC_PREVIEW_BYTES - 1));
        assert_eq!(diagnostic.original_byte_len(), original_byte_len);
        assert!(diagnostic.is_truncated());
        assert!(diagnostic.to_string().contains(&original_byte_len.to_string()));
    }

    #[test]
    fn display_escapes_control_characters() {
        let diagnostic = BoundedDiagnostic::new("first\nsecond\tline");

        assert_eq!(diagnostic.to_string(), r"first\nsecond\tline");
    }
}
