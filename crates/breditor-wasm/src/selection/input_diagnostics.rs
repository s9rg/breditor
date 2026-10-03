//! Opt-in, rejection-only scalar diagnostics for local boundary investigations.
//! Contains no document text, identifiers, addresses, or successful-call logging.

use breditor_core::document::NodeKind;

/// Reports the already-admitted inputs and the original lookup result. Never
/// retries admission or lookup, and never replaces the original command error.
pub(super) fn rejected_node(kind: &str, node_index: u32, offset: u32, found: Option<NodeKind>) {
    let message = rejection_message(kind, node_index, offset, found);
    #[cfg(target_arch = "wasm32")]
    {
        use wasm_bindgen::prelude::*;

        #[wasm_bindgen]
        extern "C" {
            #[wasm_bindgen(catch, js_namespace = console, js_name = debug)]
            fn report(message: &str) -> Result<(), JsValue>;
        }
        // A host logger may throw. Diagnostics must not change rejection behavior.
        let _ = report(&message);
    }
    #[cfg(not(target_arch = "wasm32"))]
    let _ = message;
}

fn rejection_message(kind: &str, node_index: u32, offset: u32, found: Option<NodeKind>) -> String {
    let found = match found {
        Some(NodeKind::Text) => "text",
        Some(NodeKind::Element) => "element",
        None => "missing",
    };
    format!(
        "BREDITOR_RUST_SELECTION={{\"kind\":\"{kind}\",\"nodeIndex\":{node_index},\"offset\":{offset},\"found\":\"{found}\"}}"
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn captures_only_admitted_scalars_and_original_lookup_outcome() {
        for (found, expected) in [
            (None, "missing"),
            (Some(NodeKind::Text), "text"),
            (Some(NodeKind::Element), "element"),
        ] {
            assert_eq!(
                rejection_message("children", 4, 0, found),
                format!(
                    "BREDITOR_RUST_SELECTION={{\"kind\":\"children\",\"nodeIndex\":4,\"offset\":0,\"found\":\"{expected}\"}}"
                )
            );
        }
    }
}
