use super::{POLICY, Source, TestResult, auth};
use crate::{
    Error, RecoveryDocumentCredential, RecoveryRegistrationCredentials, RecoveryReviewCredential,
    assets::{asset_id, prepare_asset},
    server::{
        ContentAddressedServerAssets, RelaySegmentHandoverApproval,
        RelaySegmentHandoverInputCoverage, ServerRecoveryAssetProvider,
    },
};
use breditor_collab_feasibility::{review::ReviewActorId, rich_replica::VersionAssetReference};
use std::{
    io::Cursor,
    sync::{Arc, Mutex},
};

struct Mapping(Arc<Mutex<String>>);

impl ServerRecoveryAssetProvider for Mapping {
    fn check(&self) -> crate::Result<()> {
        Ok(())
    }
    fn resolve(&self, reference: &VersionAssetReference) -> crate::Result<Option<String>> {
        assert_eq!(reference.asset, "asset");
        assert_eq!(reference.generation, "generation");
        Ok(Some(self.0.lock().map_err(|_| Error::NeedsRecovery)?.clone()))
    }
}

#[tokio::test]
#[expect(
    clippy::too_many_lines,
    reason = "Keep the scenario and its assertions in chronological order"
)]
async fn verified_takeover_refuses_missing_inputs_and_changed_provider_then_commits() -> TestResult
{
    let source = Source::open()?;
    let (registered, review) = source
        .handle
        .host
        .transaction(|room| {
            room.enable_review("owner")?;
            Ok((
                room.register("owner")?,
                room.register_review("owner", ReviewActorId::try_new("review")?)?,
            ))
        })
        .await?;
    let store = source.handle.host.assets.clone().ok_or("source assets")?;
    let id = source
        .handle
        .host
        .transaction(move |room| {
            let mut store = store.lock().map_err(|_| Error::NeedsRecovery)?;
            let mut png = Cursor::new(Vec::new());
            let image = image::DynamicImage::new_rgba8(1, 1);
            image.write_to(&mut png, image::ImageFormat::Png).map_err(std::io::Error::other)?;
            let png = png.into_inner();
            let id = asset_id(&png);
            room.put_asset("owner", &mut store, prepare_asset(&id, "image/png", png)?)?;
            Ok(id)
        })
        .await?;
    let backup = source.capture("before")?;
    let path = source.parent.join("verified-target");
    let mut target = backup.restore(&path, "new", POLICY)?;
    let authentication = auth(&source.token)?;
    let unmapped: Arc<dyn ServerRecoveryAssetProvider> = Arc::new(ContentAddressedServerAssets);
    let mut credentials = RecoveryRegistrationCredentials::default();
    let RelaySegmentHandoverInputCoverage::Pending(pending) = target.verify_handover_inputs(
        &authentication,
        "owner",
        &source.token,
        &credentials,
        &unmapped,
    )?
    else {
        return Err("unmapped raster and missing original credentials were accepted".into());
    };
    assert_eq!(pending.missing_registrations.len(), 2);
    assert_eq!(pending.missing_assets.len(), 1);
    assert_eq!(pending.participants.writers.len(), 1);
    assert_eq!(pending.references.room, backup.identity().native.predecessor.source);
    credentials.documents.push(RecoveryDocumentCredential {
        principal: "owner".into(),
        writer: registered.lease.writer,
        credential: crate::credentials::issue()?,
    });
    credentials.reviews.push(RecoveryReviewCredential {
        principal: "owner".into(),
        actor: "review".into(),
        credential: review.credential,
    });
    assert!(matches!(
        target.verify_handover_inputs(
            &authentication,
            "owner",
            &source.token,
            &credentials,
            &unmapped
        ),
        Err(Error::Lease)
    ));
    credentials.documents[0].credential = registered.credential;
    let mapped = Arc::new(Mutex::new(id.clone()));
    let provider: Arc<dyn ServerRecoveryAssetProvider> = Arc::new(Mapping(mapped.clone()));
    let RelaySegmentHandoverInputCoverage::Verified(inputs) = target.verify_handover_inputs(
        &authentication,
        "owner",
        &source.token,
        &credentials,
        &provider,
    )?
    else {
        return Err("complete authenticated protected inputs remained pending".into());
    };
    assert_eq!(inputs.report().assets[0].asset, id);
    let approval =
        RelaySegmentHandoverApproval::select_verified(&target, &inputs, source.lease.selection())?;
    assert!(approval.verified_inputs_sha256().is_some());

    let occupied = backup.restore(&source.parent.join("identical-but-distinct"), "new", POLICY)?;
    assert!(
        RelaySegmentHandoverApproval::select_verified(&occupied, &inputs, source.lease.selection())
            .is_err()
    );
    drop(occupied);
    assert!(matches!(
        source.handle.commit_relay_segment_handover(
            "owner",
            &source.token,
            target,
            authentication,
            &approval
        ),
        Err(Error::Contract("relay segment handover requires the selected input proof"))
    ));
    assert_eq!(source.authority.current_selection()?, source.lease.selection());

    *mapped.lock().map_err(|_| "fixture provider lock")? = format!("sha256:{}", "0".repeat(64));
    let target = backup.reopen(&path, POLICY)?;
    assert!(matches!(
        source.handle.commit_verified_relay_segment_handover(
            "owner",
            &source.token,
            target,
            auth(&source.token)?,
            &approval,
            &inputs,
        ),
        Err(Error::Contract("relay segment handover provider inputs changed"))
    ));
    assert_eq!(source.authority.current_selection()?, source.lease.selection());
    let target = backup.reopen(&path, POLICY)?;
    drop(provider);
    assert!(matches!(
        source.handle.commit_verified_relay_segment_handover(
            "owner",
            &source.token,
            target,
            auth(&source.token)?,
            &approval,
            &inputs,
        ),
        Err(Error::Contract("relay segment handover provider released"))
    ));
    source.lease.check()?;

    *mapped.lock().map_err(|_| "fixture provider lock")? = id;
    let provider: Arc<dyn ServerRecoveryAssetProvider> = Arc::new(Mapping(mapped));
    let mut target = backup.reopen(&path, POLICY)?;
    let RelaySegmentHandoverInputCoverage::Verified(recaptured) = target.verify_handover_inputs(
        &auth(&source.token)?,
        "owner",
        &source.token,
        &credentials,
        &provider,
    )?
    else {
        return Err("fresh verified input receipt".into());
    };
    let (_, successor, committed) = source.handle.commit_verified_relay_segment_handover(
        "owner",
        &source.token,
        target,
        auth(&source.token)?,
        &approval,
        &recaptured,
    )?;
    assert_eq!(source.authority.current_selection()?, committed);
    assert!(matches!(source.lease.check(), Err(Error::Lease)));
    drop(successor);

    let target = backup.reopen(&path, POLICY)?;
    let (_, _, resumed) = target.resume_handover(
        auth(&source.token)?,
        "owner",
        &source.token,
        &source.authority,
        &approval,
        &committed,
    )?;
    assert_ne!(resumed, committed);
    Ok(())
}
