//! Exact cuts without retaining decoded records. Existing literal and full-file laws stay intact.
use super::{Event, MAX_LOG, frame, scan};
use crate::Error;
use std::io::Read;
type TestResult = std::result::Result<(), Box<dyn std::error::Error>>;

#[test]
fn streaming_integrity_keeps_every_complete_cut_and_precise_incomplete_prefix() -> TestResult {
    for (family, first, parent) in
        [(frame::Family::Original, 0, [0; 32]), (frame::Family::Continuation, 8000, [7; 32])]
    {
        let mut bytes = Vec::new();
        let mut previous = parent;
        let mut cuts = vec![(0_usize, parent)];
        for index in 0..3 {
            let encoded = frame::encode(
                Event::Grant {
                    actor: "owner".into(),
                    principal: format!("reader-{index}"),
                    role: None,
                },
                family,
                first + index,
                previous,
            )?;
            bytes.extend_from_slice(&encoded.header);
            bytes.extend_from_slice(&encoded.payload);
            previous = encoded.digest;
            cuts.push((bytes.len(), previous));
        }
        for length in 0..=bytes.len() {
            let complete = cuts.iter().rposition(|(end, _)| *end <= length).ok_or("cut")?;
            let parsed = scan::verify_records_from(
                &mut &bytes[..length],
                length as u64,
                family,
                first,
                parent,
            );
            if complete == 0 && family == frame::Family::Original {
                assert!(parsed.is_err());
                continue;
            }
            let parsed = parsed?;
            assert_eq!(parsed.records, complete as u64);
            assert_eq!(parsed.bytes, cuts[complete].0 as u64);
            assert_eq!(parsed.previous, cuts[complete].1);
            assert_eq!(parsed.recovery.truncated_bytes, (length - cuts[complete].0) as u64);
        }
    }
    Ok(())
}

#[test]
fn streaming_integrity_refuses_complete_corruption_instead_of_an_admitted_prefix() -> TestResult {
    let first =
        frame::encode(super::framing_tests::seed(), frame::Family::Continuation, 0, [0; 32])?;
    let second = frame::encode(
        Event::Grant { actor: "owner".into(), principal: "reader".into(), role: None },
        frame::Family::Continuation,
        1,
        first.digest,
    )?;
    let mut bytes = [
        first.header.as_slice(),
        first.payload.as_slice(),
        second.header.as_slice(),
        second.payload.as_slice(),
    ]
    .concat();
    *bytes.last_mut().ok_or("payload")? ^= 1;
    assert!(matches!(
        scan::verify_records_from(
            &mut bytes.as_slice(),
            bytes.len() as u64,
            frame::Family::Continuation,
            0,
            [0; 32]
        ),
        Err(Error::Contract("log record checksum"))
    ));
    Ok(())
}

struct NeverRead;
impl Read for NeverRead {
    fn read(&mut self, _: &mut [u8]) -> std::io::Result<usize> {
        panic!("An oversized declaration must be refused before source I/O")
    }
}

#[test]
fn fallible_streaming_reader_propagates_a_source_failure_instead_of_returning_a_checked_cut()
-> TestResult {
    let encoded =
        frame::encode(super::framing_tests::seed(), frame::Family::Continuation, 0, [0; 32])?;
    let bytes = [encoded.header.as_slice(), encoded.payload.as_slice()].concat();
    let mut calls = 0;
    assert!(matches!(
        scan::visit_records_from(
            &mut bytes.as_slice(),
            bytes.len() as u64,
            frame::Family::Continuation,
            0,
            [0; 32],
            |_| {
                calls += 1;
                Err(Error::Contract("whole retained read failed"))
            }
        ),
        Err(Error::Contract("whole retained read failed"))
    ));
    assert_eq!(calls, 1);
    Ok(())
}
#[test]
fn streaming_integrity_keeps_declared_budgets_and_explicit_origin_without_source_reads() {
    assert!(matches!(
        scan::verify_records_from(
            &mut NeverRead,
            MAX_LOG + 1,
            frame::Family::Continuation,
            0,
            [0; 32]
        ),
        Err(Error::Contract("log byte budget"))
    ));
    assert!(matches!(
        scan::verify_records_from(&mut NeverRead, 0, frame::Family::Original, 1, [0; 32]),
        Err(Error::Contract("original log requires its original origin"))
    ));
}
