//! Exact charge for the canonical archive without traversing immutable file bytes.
use super::{super::ReviewError, history::ReviewGenerations};
use std::io::{self, Write};

pub(super) fn quoted_bytes(file: &str) -> Result<usize, ReviewError> {
    struct Counter(usize);
    impl Write for Counter {
        fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
            self.0 = self
                .0
                .checked_add(bytes.len())
                .ok_or_else(|| io::Error::other("review history archive byte count"))?;
            Ok(bytes.len())
        }

        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }
    let mut counter = Counter(0);
    serde_json::to_writer(&mut counter, file)?;
    Ok(counter.0)
}

pub(super) fn check_size(
    state: &ReviewGenerations,
    active: &str,
    limit: usize,
) -> Result<usize, ReviewError> {
    // The empty envelope includes both empty string literals and the array brackets.
    let empty_file_bytes = b"\"\"".len();
    let overhead = serde_json::to_vec(&state.archive_envelope())?.len();
    let sealed_bytes = state.sealed.iter().map(|file| file.quoted_bytes).sum::<usize>();
    let separators = state.sealed.len().saturating_sub(1);
    let bytes = overhead
        + (state.root_quoted_bytes - empty_file_bytes)
        + sealed_bytes
        + separators
        + (quoted_bytes(active)? - empty_file_bytes);
    if bytes > limit {
        return Err(ReviewError::Limit("review history archive bytes"));
    }
    Ok(bytes)
}
