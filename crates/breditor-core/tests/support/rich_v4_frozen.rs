//! The one canonical lock of the FROZEN rich language V4, shared by core and Wasm tests.
//!
//! V4 is frozen at its eight slices (ordered-list numbering, text language, image links,
//! collapsible sections, mentions, table captions, page breaks, bookmarks with internal
//! links). Hosts persist V4 documents, checkpoints and histories bound to these exact
//! fingerprints, so V4's grammar, sealed rich rule revision (4 under compiler contract 6)
//! and fingerprints must never change again. Any grammar or rule change is a new language:
//! add a V5 (its own compiler entry, bootstrap format, selector and fingerprint) instead.
//! Never "fix" a failing lock by editing these constants.
#![allow(dead_code)]

/// Failure message for every V4 lock assertion.
pub(crate) const FROZEN: &str = "rich language V4 is FROZEN: its grammar, rule revision and \
    fingerprint must never change because hosts persist V4 data; add a V5 instead";

/// Sealed rich rule revision of V4.
pub(crate) const V4_RULE_REVISION: u32 = 4;

/// V4 for schema `example/layout@1` with the standard inline preset V1 (the per-slice tests).
pub(crate) const V4_LAYOUT_FINGERPRINT: &str =
    "sha256:40ed4c0716f9baab1ec30da8b5641623b8fbbdafc7e6f838f5b0496e01add372";

/// V4 for the SDK's standard schema `breditor-editor/standard@4` with the standard inline
/// preset V1 (`profileBootstrapJsonV4`): the identity every stock saved V4 record binds.
pub(crate) const V4_STANDARD_FINGERPRINT: &str =
    "sha256:7ac98189f850119abd83956f49b82fdbdcc91a77033781fbde090ba931fccc77";

/// V4 for schema `example/layout@1` without extensions (the bare grammar and rules).
pub(crate) const V4_BARE_FINGERPRINT: &str =
    "sha256:4dd71942c6c3d31609321c8b0c0580c573c21d683c2457cfb5e906c1eb0869a0";

/// V1–V3 for `example/layout@1` with the standard inline preset; they stay exact too.
pub(crate) const V1_LAYOUT_FINGERPRINT: &str =
    "sha256:26dcb0992f0814e1d18491134f70c5857efc01b0c28d07015199490389090278";
pub(crate) const V2_LAYOUT_FINGERPRINT: &str =
    "sha256:2082e440c52cdef30f9fa46289cae3e378ea7673f05d20e6b71bb5797347b056";
pub(crate) const V3_LAYOUT_FINGERPRINT: &str =
    "sha256:6667773591bde52ef650c498d908ccbe7e8d9303683be0ab7c55400db6dd52b4";
