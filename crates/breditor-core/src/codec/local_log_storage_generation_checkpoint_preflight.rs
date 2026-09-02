/// Successful allocation preflight for one JSON string token.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[must_use]
pub(crate) struct CheckpointJsonStringPreflight {
    decoded_utf8_bytes: usize,
}

impl CheckpointJsonStringPreflight {
    /// Returns the exact number of UTF-8 bytes produced by decoding the token.
    pub(crate) const fn decoded_utf8_bytes(self) -> usize {
        self.decoded_utf8_bytes
    }
}

/// Why a checkpoint JSON string token failed allocation preflight.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum CheckpointJsonStringPreflightError {
    /// The JSON value is not a string.
    ExpectedString,
    /// The opening quote has no matching closing quote.
    UnterminatedString,
    /// A control character occurred without a JSON escape.
    UnescapedControlCharacter {
        /// Byte offset of the control character in the supplied token.
        byte_offset: usize,
    },
    /// A backslash was followed by an unsupported or absent escape character.
    InvalidEscape {
        /// Byte offset of the escape's backslash in the supplied token.
        byte_offset: usize,
    },
    /// A `\u` escape did not contain exactly four hexadecimal digits.
    InvalidUnicodeEscape {
        /// Byte offset of the escape's backslash in the supplied token.
        byte_offset: usize,
    },
    /// A high surrogate was not immediately followed by an escaped low surrogate.
    UnpairedHighSurrogate {
        /// Byte offset of the high surrogate escape's backslash.
        byte_offset: usize,
    },
    /// A low surrogate occurred without a preceding escaped high surrogate.
    UnpairedLowSurrogate {
        /// Byte offset of the low surrogate escape's backslash.
        byte_offset: usize,
    },
    /// Non-whitespace input remained after the closing quote.
    TrailingCharacters {
        /// Byte offset of the first trailing non-whitespace byte.
        byte_offset: usize,
    },
    /// The decoded UTF-8 byte count overflowed `usize`.
    DecodedLengthOverflow,
    /// Decoding crossed the caller's byte ceiling.
    DecodedLengthLimitExceeded {
        /// First decoded byte count known to exceed the ceiling.
        minimum: usize,
        /// Caller-supplied decoded UTF-8 byte ceiling.
        maximum: usize,
    },
}

/// Validates and counts exactly one JSON string token without allocating.
///
/// JSON whitespace may surround the token. The returned byte count is the
/// exact UTF-8 length after interpreting JSON escapes, including surrogate
/// pairs. Limit rejection stops at the first decoded count above
/// `maximum_decoded_utf8_bytes`; consequently its `minimum` is a lower bound,
/// not necessarily the complete decoded length of the remaining token.
pub(crate) fn preflight_checkpoint_json_string_token(
    token: &str,
    maximum_decoded_utf8_bytes: usize,
) -> Result<CheckpointJsonStringPreflight, CheckpointJsonStringPreflightError> {
    let bytes = token.as_bytes();
    let mut index = skip_json_whitespace(bytes, 0);
    if bytes.get(index) != Some(&b'"') {
        return Err(CheckpointJsonStringPreflightError::ExpectedString);
    }
    index += 1;

    let mut decoded_utf8_bytes = 0_usize;
    loop {
        let Some(&byte) = bytes.get(index) else {
            return Err(CheckpointJsonStringPreflightError::UnterminatedString);
        };
        match byte {
            b'"' => {
                index += 1;
                let trailing_index = skip_json_whitespace(bytes, index);
                if trailing_index != bytes.len() {
                    return Err(CheckpointJsonStringPreflightError::TrailingCharacters {
                        byte_offset: trailing_index,
                    });
                }
                return Ok(CheckpointJsonStringPreflight { decoded_utf8_bytes });
            }
            b'\\' => {
                preflight_escape(
                    bytes,
                    &mut index,
                    &mut decoded_utf8_bytes,
                    maximum_decoded_utf8_bytes,
                )?;
            }
            0x00..=0x1F => {
                return Err(CheckpointJsonStringPreflightError::UnescapedControlCharacter {
                    byte_offset: index,
                });
            }
            _ => {
                add_decoded_bytes(&mut decoded_utf8_bytes, 1, maximum_decoded_utf8_bytes)?;
                index += 1;
            }
        }
    }
}

fn preflight_escape(
    bytes: &[u8],
    index: &mut usize,
    decoded_utf8_bytes: &mut usize,
    maximum: usize,
) -> Result<(), CheckpointJsonStringPreflightError> {
    let escape_offset = *index;
    *index += 1;
    let Some(&escaped) = bytes.get(*index) else {
        return Err(CheckpointJsonStringPreflightError::InvalidEscape {
            byte_offset: escape_offset,
        });
    };
    match escaped {
        b'"' | b'\\' | b'/' | b'b' | b'f' | b'n' | b'r' | b't' => {
            add_decoded_bytes(decoded_utf8_bytes, 1, maximum)?;
            *index += 1;
        }
        b'u' => preflight_unicode_escape(bytes, index, decoded_utf8_bytes, maximum, escape_offset)?,
        _ => {
            return Err(CheckpointJsonStringPreflightError::InvalidEscape {
                byte_offset: escape_offset,
            });
        }
    }
    Ok(())
}

fn preflight_unicode_escape(
    bytes: &[u8],
    index: &mut usize,
    decoded_utf8_bytes: &mut usize,
    maximum: usize,
    escape_offset: usize,
) -> Result<(), CheckpointJsonStringPreflightError> {
    *index += 1;
    let code_unit = parse_hex_quad(bytes, *index).ok_or(
        CheckpointJsonStringPreflightError::InvalidUnicodeEscape { byte_offset: escape_offset },
    )?;
    *index += 4;
    match code_unit {
        0xD800..=0xDBFF => {
            preflight_low_surrogate(bytes, index, decoded_utf8_bytes, maximum, escape_offset)
        }
        0xDC00..=0xDFFF => Err(CheckpointJsonStringPreflightError::UnpairedLowSurrogate {
            byte_offset: escape_offset,
        }),
        _ => add_decoded_bytes(decoded_utf8_bytes, utf8_len(code_unit), maximum),
    }
}

fn preflight_low_surrogate(
    bytes: &[u8],
    index: &mut usize,
    decoded_utf8_bytes: &mut usize,
    maximum: usize,
    high_escape_offset: usize,
) -> Result<(), CheckpointJsonStringPreflightError> {
    let low_escape_offset = *index;
    let Some(unicode_escape_end) = index.checked_add(2) else {
        return Err(CheckpointJsonStringPreflightError::UnpairedHighSurrogate {
            byte_offset: high_escape_offset,
        });
    };
    if bytes.get(*index..unicode_escape_end) != Some(b"\\u") {
        return Err(CheckpointJsonStringPreflightError::UnpairedHighSurrogate {
            byte_offset: high_escape_offset,
        });
    }
    *index = unicode_escape_end;
    let low_code_unit = parse_hex_quad(bytes, *index).ok_or(
        CheckpointJsonStringPreflightError::InvalidUnicodeEscape { byte_offset: low_escape_offset },
    )?;
    if !(0xDC00..=0xDFFF).contains(&low_code_unit) {
        return Err(CheckpointJsonStringPreflightError::UnpairedHighSurrogate {
            byte_offset: high_escape_offset,
        });
    }
    *index += 4;
    add_decoded_bytes(decoded_utf8_bytes, 4, maximum)
}

fn add_decoded_bytes(
    decoded_utf8_bytes: &mut usize,
    increment: usize,
    maximum: usize,
) -> Result<(), CheckpointJsonStringPreflightError> {
    let Some(next) = decoded_utf8_bytes.checked_add(increment) else {
        return Err(CheckpointJsonStringPreflightError::DecodedLengthOverflow);
    };
    if next > maximum {
        return Err(CheckpointJsonStringPreflightError::DecodedLengthLimitExceeded {
            minimum: next,
            maximum,
        });
    }
    *decoded_utf8_bytes = next;
    Ok(())
}

const fn utf8_len(code_unit: u16) -> usize {
    match code_unit {
        0x0000..=0x007F => 1,
        0x0080..=0x07FF => 2,
        _ => 3,
    }
}

fn parse_hex_quad(bytes: &[u8], index: usize) -> Option<u16> {
    let end = index.checked_add(4)?;
    let digits = bytes.get(index..end)?;
    let mut value = 0_u16;
    for &digit in digits {
        value = value.checked_mul(16)?.checked_add(hex_value(digit)?)?;
    }
    Some(value)
}

fn hex_value(byte: u8) -> Option<u16> {
    match byte {
        b'0'..=b'9' => Some(u16::from(byte - b'0')),
        b'a'..=b'f' => Some(u16::from(byte - b'a') + 10),
        b'A'..=b'F' => Some(u16::from(byte - b'A') + 10),
        _ => None,
    }
}

fn skip_json_whitespace(bytes: &[u8], mut index: usize) -> usize {
    while matches!(bytes.get(index), Some(b' ' | b'\n' | b'\r' | b'\t')) {
        index += 1;
    }
    index
}

#[cfg(test)]
mod tests {
    use proptest::{
        collection::vec,
        prelude::any,
        prop_assert_eq,
        test_runner::{Config, TestCaseError},
    };

    use super::{
        CheckpointJsonStringPreflight, CheckpointJsonStringPreflightError, add_decoded_bytes,
        preflight_checkpoint_json_string_token,
    };

    fn property_config() -> Config {
        Config { cases: 128, max_shrink_iters: 2_048, ..Config::default() }
    }

    fn decoded_bytes(
        token: &str,
        maximum: usize,
    ) -> Result<usize, CheckpointJsonStringPreflightError> {
        preflight_checkpoint_json_string_token(token, maximum)
            .map(CheckpointJsonStringPreflight::decoded_utf8_bytes)
    }

    #[test]
    fn counts_raw_utf8_and_every_simple_escape_without_allocating() {
        assert_eq!(decoded_bytes("  \"aé😀\\\"\\\\\\/\\b\\f\\n\\r\\t\"\n", usize::MAX), Ok(15));
    }

    #[test]
    fn counts_bmp_escapes_and_surrogate_pairs_by_decoded_utf8_width() {
        assert_eq!(decoded_bytes(r#""\u0000\u007f\u0080\u07ff\u0800\uffff""#, 12), Ok(12));
        assert_eq!(decoded_bytes(r#""\uD83D\uDE00""#, 4), Ok(4));
        assert_eq!(decoded_bytes(r#""\ud83d\ude00""#, 4), Ok(4));
    }

    #[test]
    fn rejects_non_strings_controls_bad_escapes_and_trailing_values() {
        assert_eq!(
            decoded_bytes("null", usize::MAX),
            Err(CheckpointJsonStringPreflightError::ExpectedString)
        );
        assert_eq!(
            decoded_bytes("\"a", usize::MAX),
            Err(CheckpointJsonStringPreflightError::UnterminatedString)
        );
        assert_eq!(
            decoded_bytes("\"a\\", usize::MAX),
            Err(CheckpointJsonStringPreflightError::InvalidEscape { byte_offset: 2 })
        );
        assert_eq!(
            decoded_bytes("\"a\nb\"", usize::MAX),
            Err(CheckpointJsonStringPreflightError::UnescapedControlCharacter { byte_offset: 2 })
        );
        assert_eq!(
            decoded_bytes(r#""\v""#, usize::MAX),
            Err(CheckpointJsonStringPreflightError::InvalidEscape { byte_offset: 1 })
        );
        assert_eq!(
            decoded_bytes(r#""\u12xz""#, usize::MAX),
            Err(CheckpointJsonStringPreflightError::InvalidUnicodeEscape { byte_offset: 1 })
        );
        assert_eq!(
            decoded_bytes("\"\" true", usize::MAX),
            Err(CheckpointJsonStringPreflightError::TrailingCharacters { byte_offset: 3 })
        );
    }

    #[test]
    fn rejects_every_unpaired_surrogate_shape_at_the_originating_escape() {
        assert_eq!(
            decoded_bytes(r#""\uD800""#, usize::MAX),
            Err(CheckpointJsonStringPreflightError::UnpairedHighSurrogate { byte_offset: 1 })
        );
        assert_eq!(
            decoded_bytes(r#""\uD800x""#, usize::MAX),
            Err(CheckpointJsonStringPreflightError::UnpairedHighSurrogate { byte_offset: 1 })
        );
        assert_eq!(
            decoded_bytes(r#""\uD800\u0041""#, usize::MAX),
            Err(CheckpointJsonStringPreflightError::UnpairedHighSurrogate { byte_offset: 1 })
        );
        assert_eq!(
            decoded_bytes(r#""\uDC00""#, usize::MAX),
            Err(CheckpointJsonStringPreflightError::UnpairedLowSurrogate { byte_offset: 1 })
        );
        assert_eq!(
            decoded_bytes(r#""\uD800\u12xz""#, usize::MAX),
            Err(CheckpointJsonStringPreflightError::InvalidUnicodeEscape { byte_offset: 7 })
        );
    }

    #[test]
    fn accepts_the_exact_ceiling_and_reports_only_the_first_excess() {
        assert_eq!(decoded_bytes(r#""😀""#, 4), Ok(4));
        assert_eq!(
            decoded_bytes(r#""😀""#, 3),
            Err(CheckpointJsonStringPreflightError::DecodedLengthLimitExceeded {
                minimum: 4,
                maximum: 3
            })
        );
        assert_eq!(
            decoded_bytes(r#""\uD83D\uDE00rest""#, 1),
            Err(CheckpointJsonStringPreflightError::DecodedLengthLimitExceeded {
                minimum: 4,
                maximum: 1
            })
        );
        assert_eq!(decoded_bytes(r#""""#, 0), Ok(0));
        assert_eq!(
            decoded_bytes(r#""a""#, 0),
            Err(CheckpointJsonStringPreflightError::DecodedLengthLimitExceeded {
                minimum: 1,
                maximum: 0
            })
        );
    }

    #[test]
    fn checked_counter_keeps_usize_overflow_distinct_from_limit_excess() {
        let mut decoded = usize::MAX;
        assert_eq!(
            add_decoded_bytes(&mut decoded, 1, usize::MAX),
            Err(CheckpointJsonStringPreflightError::DecodedLengthOverflow)
        );
        assert_eq!(decoded, usize::MAX);
    }

    proptest::proptest! {
        #![proptest_config(property_config())]

        #[test]
        fn serde_string_tokens_match_the_exact_decoded_utf8_limit(
            characters in vec(any::<char>(), 0..128),
        ) {
            let source = characters.into_iter().collect::<String>();
            let token = serde_json::to_string(&source)
                .map_err(|error| TestCaseError::fail(error.to_string()))?;
            let decoded = serde_json::from_str::<String>(&token)
                .map_err(|error| TestCaseError::fail(error.to_string()))?;
            prop_assert_eq!(&decoded, &source);

            let exact_bytes = decoded.len();
            prop_assert_eq!(decoded_bytes(&token, exact_bytes), Ok(exact_bytes));
            if exact_bytes > 0 {
                let one_under = exact_bytes - 1;
                prop_assert_eq!(
                    decoded_bytes(&token, one_under),
                    Err(CheckpointJsonStringPreflightError::DecodedLengthLimitExceeded {
                        minimum: exact_bytes,
                        maximum: one_under,
                    })
                );
            }
        }
    }
}
