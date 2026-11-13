//! Test-only process entry point. The host selects an observed surviving cut
//! over private IPC, then uses the normal authenticated HTTP barriers.
use super::{Result, capture, storage};
use breditor_collab_relay::{
    RecoveryDocumentCredential, RecoveryRegistrationCredentials, RecoveryReviewCredential,
    server::{
        Authentication, NativeGenerationActivationCheckpointStatus,
        NativeGenerationActivationPrepareOptions, PreparedNativeGenerationActivationIdentity,
        SealedNativeRestartBootstrap, SealedNativeRestartBootstrapCoverage,
        ServerLogGenerationRecoveryStateIdentity, inspect_sealed_native_restart,
        prepare_durable_native_activation_control, prepare_native_room_publication,
        reopen_sealed_native_restart_host,
    },
};
use serde::Deserialize;
use serde_json::json;
use sha2::{Digest, Sha256};
use std::{ffi::OsStr, io::Read, net::SocketAddr, path::Path, sync::Arc};

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Document {
    principal: String,
    writer: String,
    credential: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Review {
    principal: String,
    actor: String,
    credential: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Input {
    checkpoint_sha256: [u8; 32],
    current: Option<ServerLogGenerationRecoveryStateIdentity>,
    listener: SocketAddr,
    documents: Vec<Document>,
    reviews: Vec<Review>,
}

pub fn checkpoint_digest(
    identity: &PreparedNativeGenerationActivationIdentity,
) -> Result<[u8; 32]> {
    Ok(Sha256::digest(serde_json::to_vec(identity)?).into())
}

pub async fn run(root: &OsStr, inspect: bool) -> Result {
    let root = std::fs::canonicalize(Path::new(root))?;
    let mut raw = Vec::new();
    std::io::stdin().take(1024 * 1024 + 1).read_to_end(&mut raw)?;
    if raw.len() > 1024 * 1024 {
        return Err("private restart selection exceeds budget".into());
    }
    let input: Input = serde_json::from_slice(&raw)?;
    if !input.listener.ip().is_loopback() || input.listener.port() == 0 {
        return Err("private restart fixture requires a loopback listener".into());
    }
    let checkpoint_root = root.join("activation");
    let mut bytes = Vec::new();
    std::fs::File::open(checkpoint_root.join("activation.json"))?
        .take(1024 * 1024 + 1)
        .read_to_end(&mut bytes)?;
    if bytes.len() > 1024 * 1024 || Sha256::digest(&bytes)[..] != input.checkpoint_sha256 {
        return Err("retained Native checkpoint bytes differ".into());
    }
    let checkpoint: PreparedNativeGenerationActivationIdentity = serde_json::from_slice(&bytes)?;
    let bootstrap = SealedNativeRestartBootstrap {
        source_root: root.join("source-intent"),
        checkpoint_root,
        authority_root: root.join("deployment"),
        operational_root: root.join("restored"),
        expected_current: input.current.unwrap_or_else(|| checkpoint.current().clone()),
        expected_checkpoint: checkpoint.clone(),
    };
    let (owner_token, owner_digest) = Authentication::issue_token()?;
    let (account_token, account_digest) = Authentication::issue_token()?;
    let auth = capture::authentication_for_accounts(json!([
        {"principal":"owner","tokenHash":owner_digest},
        {"principal":"alice","tokenHash":account_digest}
    ]))?;
    if inspect {
        if !input.documents.is_empty() || !input.reviews.is_empty() {
            return Err("inspection does not require registration credentials".into());
        }
        let observed =
            Box::pin(inspect_sealed_native_restart(bootstrap, None, auth, "owner", &owner_token))
                .await?;
        let identity = observed.identity()?;
        if identity == *checkpoint.current() {
            return Err("expected previously acknowledged work beyond the checkpoint".into());
        }
        let (archive, _) = observed.into_parts();
        let file = root.join("restart-observed.backup");
        let bytes = archive.to_bytes()?;
        storage::write_new(&file, &bytes)?;
        println!(
            "{}",
            json!({"current":identity,"path":file,"sha256":<[u8;32]>::from(Sha256::digest(&bytes))})
        );
        return Ok(());
    }
    if input.documents.len() != 7 || input.reviews.len() != 7 {
        return Err("all original restart registrations are required".into());
    }
    let protected = RecoveryRegistrationCredentials {
        documents: input
            .documents
            .into_iter()
            .map(|row| RecoveryDocumentCredential {
                principal: row.principal,
                writer: row.writer,
                credential: row.credential,
            })
            .collect(),
        reviews: input
            .reviews
            .into_iter()
            .map(|row| RecoveryReviewCredential {
                principal: row.principal,
                actor: row.actor,
                credential: row.credential,
            })
            .collect(),
    };
    let SealedNativeRestartBootstrapCoverage::Verified(reopened) = Box::pin(
        reopen_sealed_native_restart_host(bootstrap, auth, "owner", &owner_token, protected),
    )
    .await?
    else {
        return Err("restart registration coverage incomplete".into());
    };
    if reopened.status != NativeGenerationActivationCheckpointStatus::Committed {
        return Err("expected a committed predecessor epoch".into());
    }
    let next = Arc::new(
        reopened
            .host
            .prepare_durable_native_restart(
                "owner",
                &owner_token,
                reopened.checkpoint,
                &reopened.proof,
                NativeGenerationActivationPrepareOptions {
                    root: root.join("restart-activation"),
                    authority: reopened.authority.clone(),
                },
            )
            .await?,
    );
    if serde_json::to_value(next.identity())?["parent"] != json!(input.checkpoint_sha256) {
        return Err("fresh checkpoint must bind the exact committed predecessor".into());
    }
    let (operator_token, operator_digest) = Authentication::issue_token()?;
    let (router, control) = prepare_durable_native_activation_control(
        reopened.host,
        Arc::new(reopened.proof),
        next,
        reopened.authority,
        "owner",
        &owner_token,
        capture::authentication_for_digest("operator", &operator_digest)?,
    )
    .await?;
    let control = Arc::new(control);
    let listener = tokio::net::TcpListener::bind(input.listener).await?.into_std()?;
    let (publication_routes, publication) =
        prepare_native_room_publication(control.clone(), listener)?;
    let operator = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
    let address = operator.local_addr()?;
    println!(
        "{}",
        json!({
            "processId":std::process::id(),
            "activation":{"endpoint":format!("http://{address}/recovery/native-activation/v1/commit"),"selection":control.identity()},
            "publication":{"endpoint":format!("http://{address}/recovery/native-publication/v1/publish"),"selection":publication.identity()},
            "operatorToken":operator_token,"accountToken":account_token
        })
    );
    let task =
        tokio::spawn(async move { axum::serve(operator, router.merge(publication_routes)).await });
    tokio::signal::ctrl_c().await?;
    publication.close().await?;
    control.close();
    task.abort();
    let _ = task.await;
    Ok(())
}
