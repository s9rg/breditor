//! Matching Wasm owner for shared rich-AST contracts, still isolated from shipping modules.
use crate::{
    Error,
    rich_replica::{Command, RichReplica},
};
use breditor_core::codec::DocumentJsonCodecV2;
use wasm_bindgen::prelude::*;
fn error(value: impl std::fmt::Display) -> JsValue {
    JsValue::from_str(&value.to_string())
}
fn codec() -> Result<DocumentJsonCodecV2, JsValue> {
    Ok(DocumentJsonCodecV2::new(crate::rich_ast_fixture::schema().map_err(error)?))
}

/// Exclusive shared writer whose exported content is an admitted Breditor rich AST.
#[wasm_bindgen]
pub struct RichReplicaProbe {
    inner: RichReplica,
}
#[wasm_bindgen]
impl RichReplicaProbe {
    /// Seed a room once from a fingerprint-bound admitted Document V2.
    #[wasm_bindgen(constructor)]
    pub fn new(document: &str, writer: String) -> Result<Self, JsValue> {
        Ok(Self { inner: RichReplica::new(codec()?, document, writer).map_err(error)? })
    }
    /// Join existing causal state with a newly leased writer.
    pub fn join(document: String, writer: String, bytes: &[u8]) -> Result<Self, JsValue> {
        Ok(Self {
            inner: RichReplica::join(codec()?, document, writer, bytes.to_vec()).map_err(error)?,
        })
    }
    /// Resume the exact same writer after reacquiring its exclusive lease.
    pub fn restore(document: &str, journal: &str) -> Result<Self, JsValue> {
        Ok(Self { inner: RichReplica::restore(codec()?, document, journal).map_err(error)? })
    }
    /// Apply one bounded closed shared action group through staged Rust adoption.
    pub fn apply(&mut self, input: &str) -> Result<bool, JsValue> {
        if input.len() > 1024 * 1024 {
            return Err(error(Error::Limit("rich action JSON bytes")));
        }
        let commands: Vec<Command> = serde_json::from_str(input).map_err(|_| error(Error::Json))?;
        self.inner.apply(commands).map_err(error)
    }

    /// Exact canonical writer/counter strings for asynchronous content guards.
    pub fn causal_version(&self) -> String {
        self.inner.causal_version()
    }

    /// Reject old shared coordinates before parsing the action JSON.
    pub fn apply_at(&mut self, version: &str, input: &str) -> Result<bool, JsValue> {
        if version.len() > 64 * 1024 || version != self.inner.causal_version() {
            return Err(error(Error::Contract("stale shared causal version")));
        }
        if input.len() > 1024 * 1024 {
            return Err(error(Error::Limit("rich action JSON bytes")));
        }
        let commands: Vec<Command> = serde_json::from_str(input).map_err(|_| error(Error::Json))?;
        self.inner.apply_at(version, commands).map_err(error)
    }
    /// Import changes supplied by an authorized host; no networking side effect.
    pub fn receive(&mut self, bytes: &[u8]) -> Result<(), JsValue> {
        self.inner.receive(bytes.to_vec()).map_err(error)
    }

    /// Join the original versioned room/schema/model envelope before engine admission.
    pub fn join_frame(document: String, writer: String, input: &str) -> Result<Self, JsValue> {
        Ok(Self {
            inner: RichReplica::join_frame(codec()?, document, writer, input).map_err(error)?,
        })
    }
    /// Export a versioned bound update; the host still authenticates transport/writers.
    pub fn update_frame(&self) -> Result<String, JsValue> {
        self.inner.update_frame().map_err(error)
    }
    /// Check all declared bindings before any staged engine import.
    pub fn receive_frame(&mut self, input: &str) -> Result<(), JsValue> {
        self.inner.receive_frame(input).map_err(error)
    }
    /// Undo only this writer's effect, including writer-owned placement/deletion.
    pub fn undo(&mut self) -> Result<bool, JsValue> {
        self.inner.undo().map_err(error)
    }
    /// Redo the original effect and causal priority.
    pub fn redo(&mut self) -> Result<bool, JsValue> {
        self.inner.redo().map_err(error)
    }
    /// Exact current Breditor Document V2, not probe values or CRDT JSON.
    pub fn document_json(&self) -> String {
        self.inner.document_json().into()
    }
    /// Opaque causal engine changes for the host transport.
    pub fn updates(&self) -> Result<Vec<u8>, JsValue> {
        self.inner.updates().map_err(error)
    }
    /// Same-writer journal with checked future undo/redo identities.
    pub fn checkpoint(&self) -> Result<String, JsValue> {
        self.inner.checkpoint().map_err(error)
    }
    /// Exact small bounded writer-local undo count.
    pub fn undo_count(&self) -> u32 {
        u32::try_from(self.inner.undo_count()).unwrap_or(u32::MAX)
    }
    /// Exact small bounded writer-local redo count.
    pub fn redo_count(&self) -> u32 {
        u32::try_from(self.inner.redo_count()).unwrap_or(u32::MAX)
    }
}
