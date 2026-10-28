//! Closed UTF-8 ordered requirements and separate operator credentials refuse before provider work.
use super::{Network, Request, Setup, TestResult, body, query};
use serde_json::json;

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn wrong_source_unknown_fields_duplicate_unsorted_and_malformed_requirements_refuse_before_provider_callbacks()
-> TestResult {
    let setup = Box::pin(Setup::new((3, true), true)).await?;
    let server = Network::start(setup.router.clone()).await?;
    let source = body(&setup, json!([]), json!([]));
    let calls = setup.mapping.lock().map_err(|_| "mapping")?.calls;
    for name in [
        "family",
        "version",
        "field",
        "instance",
        "duplicate",
        "order",
        "upload",
        "empty",
        "long",
        "pair-field",
    ] {
        let mut value = source.clone();
        match name {
            "family" => value["format"] = json!("other"),
            "version" => value["formatVersion"] = json!(2),
            "field" => value["verified"] = json!(true),
            "instance" => value["selection"]["instance"] = json!("0".repeat(64)),
            "duplicate" => {
                value["references"] =
                    json!([{"asset":"a","generation":"b"},{"asset":"a","generation":"b"}]);
            }
            "order" => {
                value["references"] =
                    json!([{"asset":"z","generation":"a"},{"asset":"a","generation":"a"}]);
            }
            "upload" => value["uploads"] = json!(["opaque"]),
            "empty" => value["references"] = json!([{"asset":"","generation":"a"}]),
            "long" => value["references"] = json!([{"asset":"a".repeat(1025),"generation":"a"}]),
            _ => value["references"] = json!([{"asset":"a","generation":"b","verified":true}]),
        }
        assert_eq!(query(&server, &setup, &value).await?.status, 400, "{name}");
    }
    let mut request = Request::check(&setup.fixture.owner);
    request.path = "/recovery/generations/v1/assets/check";
    request.principal = "owner";
    assert_eq!(server.request(&request, &serde_json::to_vec(&source)?).await?.status, 403);
    assert_eq!(setup.mapping.lock().map_err(|_| "mapping")?.calls, calls);
    server.stop().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn exact_utf8_order_is_not_utf16_order_and_opaque_hash_like_names_are_not_normalized()
-> TestResult {
    let setup = Box::pin(Setup::new((3, true), true)).await?;
    let server = Network::start(setup.router.clone()).await?;
    let ordered = json!([{"asset":"sha256:opaque","generation":"g"},{"asset":"\u{e000}","generation":"g"},{"asset":"\u{10000}","generation":"g"}]);
    let good = query(&server, &setup, &body(&setup, ordered.clone(), json!([]))).await?;
    assert_eq!(good.status, 200);
    let value: serde_json::Value = serde_json::from_slice(&good.body)?;
    assert_eq!(value["missing"].as_array().ok_or("missing")?.len(), 3);
    let mut wrong = ordered.as_array().ok_or("ordered")?.clone();
    wrong.swap(1, 2);
    assert_eq!(query(&server, &setup, &body(&setup, json!(wrong), json!([]))).await?.status, 400);
    server.stop().await?;
    Ok(())
}
