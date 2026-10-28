//! Bounded test-owned request construction; no authentication material enters saved evidence.
use super::{Network, Request, Setup, TestResult};
pub(super) fn body(
    setup: &Setup,
    references: serde_json::Value,
    uploads: serde_json::Value,
) -> serde_json::Value {
    serde_json::Value::Object(
        [
            (
                "format".into(),
                serde_json::json!("breditor/server-log-generation-recovery-asset-requirements"),
            ),
            ("formatVersion".into(), serde_json::json!(1)),
            ("selection".into(), serde_json::json!(setup.selection())),
            ("references".into(), references),
            ("uploads".into(), uploads),
        ]
        .into_iter()
        .collect(),
    )
}
pub(super) async fn query(
    server: &Network,
    setup: &Setup,
    value: &serde_json::Value,
) -> TestResult<super::super::network::Response> {
    let mut request = Request::check(&setup.token);
    request.path = "/recovery/generations/v1/assets/check";
    server.request(&request, &serde_json::to_vec(value)?).await
}
