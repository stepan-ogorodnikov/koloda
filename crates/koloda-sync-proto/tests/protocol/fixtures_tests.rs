//! Golden schema-1 envelopes: `fixtures/<sample>.hex` holds the sealed bytes of each `samples()` entry.
//! After an intended wire change, regenerate with
//! `cargo test -p koloda-sync-proto --test protocol write_envelope_fixtures -- --ignored` and commit the diff.

use std::fs;
use std::path::PathBuf;

use koloda_sync_proto::envelope::Envelope;
use koloda_sync_proto::payload::{seal, Payload};

use crate::samples::samples;

const HEX_PER_LINE: usize = 64;

fn fixture_path(name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("fixtures")
        .join(format!("{name}.hex"))
}

fn to_hex(bytes: &[u8]) -> String {
    let hex: String = bytes.iter().map(|byte| format!("{byte:02x}")).collect();
    let lines: Vec<&str> = hex
        .as_bytes()
        .chunks(HEX_PER_LINE)
        .map(|chunk| std::str::from_utf8(chunk).expect("hex is ASCII"))
        .collect();
    lines.join("\n") + "\n"
}

fn from_hex(text: &str) -> Vec<u8> {
    let digits: String = text.chars().filter(|c| !c.is_whitespace()).collect();
    digits
        .as_bytes()
        .chunks(2)
        .map(|pair| {
            let pair = std::str::from_utf8(pair).expect("fixture is ASCII hex");
            u8::from_str_radix(pair, 16).expect("fixture is hex")
        })
        .collect()
}

#[test]
fn sealed_samples_match_their_golden_bytes() {
    for sample in samples() {
        let golden_text = fs::read_to_string(fixture_path(sample.name))
            .unwrap_or_else(|error| panic!("{}: missing fixture ({error})", sample.name));
        let golden = from_hex(&golden_text);

        let sealed = seal(sample.seal, &sample.payload).unwrap();
        assert_eq!(
            to_hex(&sealed.bytes),
            to_hex(&golden),
            "{}: the encoding changed; regenerate fixtures only for an intended wire change",
            sample.name
        );

        let envelope = Envelope::decode(&golden).unwrap();
        assert_eq!(
            Payload::decode(&envelope.header, &envelope.payload),
            Ok(sample.payload),
            "{}: golden bytes no longer decode to the sample",
            sample.name
        );
    }
}

#[test]
#[ignore = "writes fixtures; run only after an intended wire change"]
fn write_envelope_fixtures() {
    let dir = fixture_path("_").with_file_name("");
    fs::create_dir_all(&dir).unwrap();
    for sample in samples() {
        let sealed = seal(sample.seal, &sample.payload).unwrap();
        fs::write(fixture_path(sample.name), to_hex(&sealed.bytes)).unwrap();
    }
}
