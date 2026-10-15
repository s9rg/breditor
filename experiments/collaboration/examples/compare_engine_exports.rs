//! Compare opaque native/Wasm engine exports without confusing packing with causal operations.
use loro::{LoroDoc, ToJson, VersionVector};
use serde::Deserialize;
use serde_json::json;
use std::io::{BufRead, BufReader, Read};

const MAX_INPUT_BYTES: usize = 16 * 1024 * 1024;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Input {
    cases: Vec<Case>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Case {
    name: String,
    native: Vec<u8>,
    wasm: Vec<u8>,
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let input = read_request(std::io::stdin().lock())?;
    compare(input)
}

/// One newline-terminated request; completion must not depend on the pipe reaching EOF.
fn read_request(reader: impl Read) -> Result<Input, Box<dyn std::error::Error>> {
    let mut input = String::new();
    BufReader::new(reader.take(u64::try_from(MAX_INPUT_BYTES + 1)?)).read_line(&mut input)?;
    if input.len() > MAX_INPUT_BYTES {
        return Err("comparison input bytes".into());
    }
    if !input.ends_with('\n') {
        return Err("comparison request needs a newline terminator".into());
    }
    Ok(serde_json::from_str(&input)?)
}

fn compare(input: Input) -> Result<(), Box<dyn std::error::Error>> {
    if input.cases.len() > 8 {
        return Err("comparison cases".into());
    }
    for case in input.cases {
        if case.native.len() > 1024 * 1024 || case.wasm.len() > 1024 * 1024 {
            return Err("comparison engine bytes".into());
        }
        let a = LoroDoc::new();
        let b = LoroDoc::new();
        a.import(&case.native)?;
        b.import(&case.wasm)?;
        let start = VersionVector::default();
        let aa = serde_json::to_value(
            a.export_json_updates_without_peer_compression(&start, &a.oplog_vv()),
        )?;
        let bb = serde_json::to_value(
            b.export_json_updates_without_peer_compression(&start, &b.oplog_vv()),
        )?;
        println!(
            "{}",
            json!({"name":case.name,"bytesEqual":case.native==case.wasm,"operationsEqual":aa==bb,"firstOperationDifference":difference(&aa,&bb,""),
            "causalVersionEqual":a.oplog_vv()==b.oplog_vv(),"stateEqual":a.get_deep_value().to_json_value()==b.get_deep_value().to_json_value()})
        );
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Cursor, ErrorKind};
    type TestResult = Result<(), Box<dyn std::error::Error>>;

    struct StillOpen(Cursor<&'static [u8]>);
    impl Read for StillOpen {
        fn read(&mut self, output: &mut [u8]) -> std::io::Result<usize> {
            let length = self.0.read(output)?;
            if length == 0 && !output.is_empty() {
                return Err(ErrorKind::WouldBlock.into());
            }
            Ok(length)
        }
    }
    #[test]
    fn a_complete_frame_does_not_wait_for_eof() -> TestResult {
        let input = read_request(StillOpen(Cursor::new(b"{\"cases\":[]}\n")))?;
        assert!(input.cases.is_empty());
        Ok(())
    }
    #[test]
    fn a_frame_requires_its_explicit_terminator() {
        assert!(read_request(Cursor::new(b"{\"cases\":[]}")).is_err());
    }
    #[test]
    fn oversized_frames_stop_at_the_byte_limit() -> TestResult {
        let error = read_request(Cursor::new(vec![b' '; MAX_INPUT_BYTES + 1]))
            .err()
            .ok_or("oversized comparison was accepted")?;
        assert_eq!(error.to_string(), "comparison input bytes");
        Ok(())
    }
}

fn difference(
    a: &serde_json::Value,
    b: &serde_json::Value,
    path: &str,
) -> Option<serde_json::Value> {
    if a == b {
        return None;
    }
    if let (Some(a), Some(b)) = (a.as_object(), b.as_object()) {
        for key in a.keys().chain(b.keys()) {
            if let Some(value) = difference(
                a.get(key).unwrap_or(&serde_json::Value::Null),
                b.get(key).unwrap_or(&serde_json::Value::Null),
                &format!("{path}/{key}"),
            ) {
                return Some(value);
            }
        }
    }
    if let (Some(a), Some(b)) = (a.as_array(), b.as_array())
        && a.len() == b.len()
    {
        for (index, (a, b)) in a.iter().zip(b).enumerate() {
            if let Some(value) = difference(a, b, &format!("{path}/{index}")) {
                return Some(value);
            }
        }
    }
    Some(
        json!({"path":path,"native":a.to_string().chars().take(180).collect::<String>(),"wasm":b.to_string().chars().take(180).collect::<String>()}),
    )
}
