//! Context-aware Unicode case mapping of one text block, scalar by scalar.
//!
//! Every source scalar maps to its own nonempty output string, so a length change
//! (`ß` → `SS`) never moves text across a format-run boundary: the caller keeps
//! each scalar's output inside the run that owned the source scalar.
use super::{RichCaseChange, RichCaseOptions};
use unicode_segmentation::UnicodeSegmentation;

/// Mapping of every scalar of one block (`None` keeps the scalar unchanged).
pub(super) struct BlockMapping {
    /// Byte offset of each scalar and its replacement, in text order.
    pub(super) scalars: Vec<(usize, char, Option<String>)>,
}

/// Map a complete block. `change` must already be resolved (never `Cycle`).
pub(super) fn map_block(
    text: &str,
    change: RichCaseChange,
    options: &RichCaseOptions,
) -> BlockMapping {
    let title = matches!(change, RichCaseChange::Title).then(|| title_plan(text, options));
    let chars: Vec<(usize, char)> = text.char_indices().collect();
    let mut scalars = Vec::with_capacity(chars.len());
    for (index, &(byte, c)) in chars.iter().enumerate() {
        let mapped = match change {
            RichCaseChange::Upper => upper(c, options.turkic),
            RichCaseChange::Lower => lower(&chars, index, options.turkic),
            RichCaseChange::Title => match title.as_ref().and_then(|plan| plan.role(byte)) {
                Some(Role::Capital) => titlecase(c, options.turkic),
                Some(Role::Lower) => lower(&chars, index, options.turkic),
                None => c.to_string(),
            },
            RichCaseChange::Cycle => c.to_string(),
        };
        let changed = mapped.chars().ne(std::iter::once(c));
        scalars.push((byte, c, changed.then_some(mapped)));
    }
    BlockMapping { scalars }
}

fn upper(c: char, turkic: bool) -> String {
    if turkic && c == 'i' {
        return "\u{130}".to_owned();
    }
    c.to_uppercase().collect()
}

fn lower(chars: &[(usize, char)], index: usize, turkic: bool) -> String {
    let c = chars[index].1;
    if turkic {
        match c {
            'I' => return "\u{131}".to_owned(),
            '\u{130}' => return "i".to_owned(),
            _ => {}
        }
    }
    if c == '\u{3A3}' {
        // Unicode Final_Sigma: preceded by a cased letter and not followed by one,
        // skipping case-ignorable scalars (approximated, see FORMATTING_PRODUCTIVITY.md).
        let before = chars[..index].iter().rev().map(|(_, c)| *c).find(|c| !ignorable(*c));
        let after = chars[index + 1..].iter().map(|(_, c)| *c).find(|c| !ignorable(*c));
        return if before.is_some_and(cased) && !after.is_some_and(cased) {
            "\u{3C2}".to_owned()
        } else {
            "\u{3C3}".to_owned()
        };
    }
    c.to_lowercase().collect()
}

fn cased(c: char) -> bool {
    c.is_lowercase() || c.is_uppercase() || is_titlecase(c)
}

fn ignorable(c: char) -> bool {
    matches!(c, '\'' | '\u{2019}' | '\u{B7}' | '.' | ':' | '^' | '`' | '\u{AD}')
        || ('\u{300}'..='\u{36F}').contains(&c)
}

fn is_titlecase(c: char) -> bool {
    matches!(c, '\u{1C5}' | '\u{1C8}' | '\u{1CB}' | '\u{1F2}')
        || matches!(u32::from(c), 0x1F88..=0x1F8F | 0x1F98..=0x1F9F | 0x1FA8..=0x1FAF)
        || matches!(c, '\u{1FBC}' | '\u{1FCC}' | '\u{1FFC}')
}

/// Unicode titlecase mapping (`UnicodeData` + `SpecialCasing`, unconditional entries).
pub(super) fn titlecase(c: char, turkic: bool) -> String {
    if turkic && c == 'i' {
        return "\u{130}".to_owned();
    }
    let special = match c {
        // Latin digraphs have a dedicated titlecase letter.
        '\u{1C4}'..='\u{1C6}' => Some("\u{1C5}"),
        '\u{1C7}'..='\u{1C9}' => Some("\u{1C8}"),
        '\u{1CA}'..='\u{1CC}' => Some("\u{1CB}"),
        '\u{1F1}'..='\u{1F3}' => Some("\u{1F2}"),
        'ß' => Some("Ss"),
        '\u{FB00}' => Some("Ff"),
        '\u{FB01}' => Some("Fi"),
        '\u{FB02}' => Some("Fl"),
        '\u{FB03}' => Some("Ffi"),
        '\u{FB04}' => Some("Ffl"),
        '\u{FB05}' | '\u{FB06}' => Some("St"),
        '\u{587}' => Some("\u{535}\u{582}"),
        '\u{FB13}' => Some("\u{544}\u{576}"),
        '\u{FB14}' => Some("\u{544}\u{565}"),
        '\u{FB15}' => Some("\u{544}\u{56B}"),
        '\u{FB16}' => Some("\u{54E}\u{576}"),
        '\u{FB17}' => Some("\u{544}\u{56D}"),
        '\u{1FB3}' => Some("\u{1FBC}"),
        '\u{1FC3}' => Some("\u{1FCC}"),
        '\u{1FF3}' => Some("\u{1FFC}"),
        _ => None,
    };
    if let Some(value) = special {
        return value.to_owned();
    }
    let code = u32::from(c);
    if matches!(code, 0x1F80..=0x1FAF) {
        // Greek with ypogegrammeni: the titlecase form is the prosgegrammeni capital.
        let title = if code & 0xF < 8 { code + 8 } else { code };
        return char::from_u32(title).map_or_else(|| c.to_string(), String::from);
    }
    c.to_uppercase().collect()
}

enum Role {
    Capital,
    Lower,
}

struct TitlePlan {
    /// Byte ranges of word scalars: the first cased scalar is capitalized unless minor.
    capitals: Vec<usize>,
    words: Vec<std::ops::Range<usize>>,
}
impl TitlePlan {
    fn role(&self, byte: usize) -> Option<Role> {
        if self.capitals.binary_search(&byte).is_ok() {
            return Some(Role::Capital);
        }
        let index = self.words.partition_point(|range| range.end <= byte);
        self.words.get(index).filter(|range| range.start <= byte).map(|_| Role::Lower)
    }
}

/// UAX #29 words of the whole block. The first and last word and every word after
/// sentence punctuation are always capitalized; other configured minor words stay lower.
fn title_plan(text: &str, options: &RichCaseOptions) -> TitlePlan {
    let segments: Vec<(usize, &str)> = text.split_word_bound_indices().collect();
    let words: Vec<(usize, &str)> =
        segments.iter().copied().filter(|(_, s)| s.chars().any(char::is_alphanumeric)).collect();
    let mut capitals = Vec::new();
    let mut ranges = Vec::with_capacity(words.len());
    let mut previous_end = 0usize;
    for (index, &(start, word)) in words.iter().enumerate() {
        let gap = &text[previous_end..start];
        let sentence_start = index == 0
            || gap.chars().any(|c| matches!(c, '.' | '!' | '?' | ':' | '\n' | '\u{2014}'));
        let last = index + 1 == words.len();
        let minor = !sentence_start && !last && options.is_minor(word);
        if !minor && let Some((offset, _)) = word.char_indices().find(|(_, c)| cased(*c)) {
            capitals.push(start + offset);
        }
        ranges.push(start..start + word.len());
        previous_end = start + word.len();
    }
    TitlePlan { capitals, words: ranges }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn apply(text: &str, change: RichCaseChange, options: &RichCaseOptions) -> String {
        map_block(text, change, options)
            .scalars
            .into_iter()
            .map(|(_, c, mapped)| mapped.unwrap_or_else(|| c.to_string()))
            .collect()
    }
    #[test]
    fn unicode_default_and_turkic_mappings() {
        let default = RichCaseOptions::default();
        let turkic = RichCaseOptions { turkic: true, ..RichCaseOptions::default() };
        assert_eq!(apply("straße", RichCaseChange::Upper, &default), "STRASSE");
        assert_eq!(apply("ΟΔΟΣ ΣΑΣ", RichCaseChange::Lower, &default), "οδος σας");
        assert_eq!(apply("istanbul", RichCaseChange::Upper, &default), "ISTANBUL");
        assert_eq!(apply("istanbul", RichCaseChange::Upper, &turkic), "İSTANBUL");
        assert_eq!(apply("DİYARBAKIR", RichCaseChange::Lower, &turkic), "diyarbakır");
        assert_eq!(apply("ǆungla ﬁsh", RichCaseChange::Title, &default), "ǅungla Fish");
    }
    #[test]
    fn title_case_minor_words_and_sentence_starts() {
        let options = RichCaseOptions::default();
        assert_eq!(
            apply("THE lord OF the rings: the return of the king", RichCaseChange::Title, &options),
            "The Lord of the Rings: The Return of the King"
        );
        assert_eq!(apply("don't stop", RichCaseChange::Title, &options), "Don't Stop");
        let none = RichCaseOptions { minor_words: Vec::new(), ..RichCaseOptions::default() };
        assert_eq!(apply("war and peace", RichCaseChange::Title, &none), "War And Peace");
    }
}
