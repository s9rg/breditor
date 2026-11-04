//! Actual output budgets, canonical bytes and a stateful serializer regression.
use super::encoding::encode;
use crate::Error;
use serde::{Serialize, Serializer};
use serde_json::json;
use std::cell::Cell;

struct ChangesOnSecondRead(Cell<usize>);
impl Serialize for ChangesOnSecondRead {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let calls = self.0.get();
        self.0.set(calls + 1);
        serializer.serialize_str(if calls == 0 { "a" } else { "larger than three bytes" })
    }
}

#[test]
fn actual_output_enforces_budget_without_second_serialize() -> Result<(), Error> {
    let value = ChangesOnSecondRead(Cell::new(0));
    let encoded = encode(&value, 3)?;
    assert_eq!(encoded, "\"a\"");
    assert_eq!(value.0.get(), 1);
    assert_eq!(encoded.len(), 3);
    Ok(())
}

#[test]
fn exact_utf8_json_boundary_keeps_standard_bytes_and_refusals() -> Result<(), Error> {
    for value in [
        json!(null),
        json!(true),
        json!(-123_456_789),
        json!("🙂 日本語 \" slash\\ newline\n control\u{0000}"),
        json!({"native": [0, 1, 9, 10, 99, 100, 255], "selection": null}),
        json!((0_u8..=255).cycle().take(32768).collect::<Vec<_>>()),
    ] {
        let expected = serde_json::to_string(&value)?;
        assert_eq!(encode(&value, expected.len())?, expected);
        assert!(matches!(
            encode(&value, expected.len() - 1),
            Err(Error::Limit("segmented history bytes"))
        ));
    }
    assert!(matches!(encode(&0, 0), Err(Error::Limit("segmented history bytes"))));
    Ok(())
}

#[test]
fn borrowed_active_bytes_equal_owned_records_across_native_history_changes() -> super::tests::Result
{
    use super::tests::{cold, enable, insert, seal, setup};
    for (language, standard, scope, mask) in
        [(1, false, 0, 0), (2, true, 1, 1), (3, true, 2, 5), (3, false, 2, 7)]
    {
        let (profile, mut owner) = setup(language, standard, scope, mask)?;
        insert(&mut owner, "Root 🙂 ")?;
        enable(&mut owner)?;
        for boundary in 0..3 {
            insert(&mut owner, "Retained native work 日本語 ")?;
            let before = owner.segmented_checkpoint()?;
            let state = owner.segmented.as_ref().ok_or(Error::Contract("test segmented state"))?;
            assert_eq!(
                serde_json::to_string(&state.active(&owner)?)?,
                serde_json::to_string(&state.active_ref(&owner)?)?
            );
            assert_eq!(owner.segmented_checkpoint()?, before);
            let restored = cold(&profile, &owner)?;
            assert_eq!(restored.segmented_checkpoint()?, before);
            assert!(owner.undo()?);
            assert!(owner.redo()?);
            let state = owner.segmented.as_ref().ok_or(Error::Contract("test segmented state"))?;
            assert_eq!(
                serde_json::to_string(&state.active(&owner)?)?,
                serde_json::to_string(&state.active_ref(&owner)?)?
            );
            seal(&mut owner, &format!("encoded-generation-{boundary}"))?;
        }
    }
    Ok(())
}

/// Literal previous two-pass implementation, retained only as a timing oracle.
fn previous_encode(value: &impl Serialize, limit: usize) -> Result<String, Error> {
    use std::io::{self, Write};
    struct Counter {
        bytes: usize,
        limit: usize,
    }
    impl Write for Counter {
        fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
            if bytes.len() > self.limit - self.bytes {
                return Err(io::Error::other("segmented history byte budget"));
            }
            self.bytes += bytes.len();
            Ok(bytes.len())
        }
        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }
    serde_json::to_writer(&mut Counter { bytes: 0, limit }, value)
        .map_err(|_| Error::Limit("segmented history bytes"))?;
    Ok(serde_json::to_string(value)?)
}

#[test]
#[ignore = "Explicit local timing sample; no performance threshold or Wasm claim"]
fn compare_single_pass_with_previous_byte_identical_encoder() -> super::tests::Result {
    use std::{hint::black_box, time::Instant};
    let value =
        json!({"native":(0_u8..=255).cycle().take(256*1024).collect::<Vec<_>>(),"ui":"🙂 日本語"});
    let expected = serde_json::to_string(&value)?;
    let limit = super::super::session::MAX_JOURNAL_BYTES;
    let mut before = Vec::new();
    let mut after = Vec::new();
    for _ in 0..5 {
        let start = Instant::now();
        for _ in 0..3 {
            assert_eq!(black_box(previous_encode(&value, limit)?), expected);
        }
        before.push(start.elapsed().as_nanos());
        let start = Instant::now();
        for _ in 0..3 {
            assert_eq!(black_box(encode(&value, limit)?), expected);
        }
        after.push(start.elapsed().as_nanos());
    }
    eprintln!(
        "SEGMENTED_ENCODING_BENCH {}",
        json!({"scope":"Native test-profile encoder timing only, not Wasm or complete recovery", "samples":5,"encodesPerSample":3,"encodedBytes":expected.len(),"previousNanos":before,"singlePassNanos":after,"exactBytesVerified":true})
    );
    Ok(())
}
