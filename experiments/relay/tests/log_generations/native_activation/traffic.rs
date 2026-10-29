//! Original wire messages and actual receipts; no reconstructed acknowledgements.
use super::{TestResult, author::Author, network::Socket};
use breditor_collab_feasibility::review::ReviewOutcome;
use serde_json::{Value, json};
pub(super) async fn authenticate(socket: &mut Socket, token: &str, atomic: bool) -> TestResult {
    let capabilities =
        if atomic { vec!["reviewV1", "writerTransportV2"] } else { vec!["reviewV1"] };
    assert_eq!(socket.request(json!({"kind":"authenticate","principal":"owner","token":token,"capabilities":capabilities})).await?["kind"],"authenticated");
    Ok(())
}
pub(super) async fn resume(socket: &mut Socket, author: &Author) -> TestResult {
    assert_eq!(socket.request(json!({"kind":"resume","writer":author.document_registration.lease.writer,"credential":author.document_registration.credential})).await?["kind"],"resumed");
    assert_eq!(socket.request(json!({"kind":"reviewResume","actor":author.review_registration.lease.actor,"credential":author.review_registration.credential})).await?["kind"],"reviewResumed");
    Ok(())
}
pub(super) async fn send_document(
    socket: &mut Socket,
    author: &mut Author,
    atomic: bool,
    retry: bool,
) -> TestResult {
    let groups: Value = serde_json::from_str(&if atomic {
        author
            .document
            .writer_groups_v2_guarded(&author.document.observe()?, &author.document_through)?
    } else {
        author
            .document
            .writer_groups_guarded(&author.document.observe()?, &author.document_through)?
    })?;
    for frame in groups["groups"].as_array().ok_or("writer groups")? {
        let first = socket.request(json!({"kind":"submit","group":frame})).await?;
        assert_eq!(first["kind"], "durable");
        assert_eq!(first["duplicate"], false);
        if retry {
            let repeated = socket.request(json!({"kind":"submit","group":frame})).await?;
            assert_eq!(repeated["duplicate"], true);
            assert_eq!(repeated["sequence"], first["sequence"]);
            assert_eq!(repeated["receipt"], first["receipt"]);
        }
    }
    author.document_through = groups["through"].as_str().ok_or("through")?.into();
    Ok(())
}
pub(super) async fn send_comments(
    socket: &mut Socket,
    author: &mut Author,
    retry: bool,
) -> TestResult {
    let frame = author.review.export_frame(author.review_through)?;
    let first = socket.request(json!({"kind":"reviewSubmit","frame":frame})).await?;
    assert_eq!(first["kind"], "reviewAdmission");
    assert_eq!(first["admission"]["kind"], "durable");
    assert_eq!(first["admission"]["duplicate"], false);
    if retry {
        let repeated = socket.request(json!({"kind":"reviewSubmit","frame":frame})).await?;
        assert_eq!(repeated["admission"]["duplicate"], true);
        assert_eq!(repeated["admission"]["sequence"], first["admission"]["sequence"]);
        assert_eq!(repeated["admission"]["receipt"], first["admission"]["receipt"]);
    }
    author.review_through = author.review.local_writer_clock()?.through.parse()?;
    Ok(())
}
pub(super) async fn history(socket: &mut Socket, author: &mut Author, atomic: bool) -> TestResult {
    let document = author.document.document_json().to_owned();
    let comments = serde_json::to_value(author.review.view()?.threads)?;
    for redo in [false, true] {
        assert!(if redo { author.document.redo()? } else { author.document.undo()? });
        send_document(socket, author, atomic, false).await?;
        let observed = author.review.observe();
        let outcome = if redo {
            author.document.redo_review_guarded(
                &author.document.observe()?,
                &mut author.review,
                &observed,
            )?
        } else {
            author.document.undo_review_guarded(
                &author.document.observe()?,
                &mut author.review,
                &observed,
            )?
        };
        assert!(matches!(outcome, ReviewOutcome::Committed(_)));
        send_comments(socket, author, false).await?;
    }
    assert_eq!(author.document.document_json(), document);
    assert_eq!(serde_json::to_value(author.review.view()?.threads)?, comments);
    Ok(())
}
