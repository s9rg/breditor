//! A changed source or provider cannot spend the approved epoch. A synced epoch can resume.
use super::{TestResult, image, router_with_continued_assets_and_deployment_lease};
use crate::{
    ContinuedAssetStore, Error, RecoveryRegistrationCredentials,
    assets::{AssetStore, asset_id, prepare_asset},
    room::segment_handover_test_source,
    server::{
        Authentication, ContinuedRasterActivation, ContinuedRasterActivationApproval,
        ContinuedRasterRestart, ContinuedRasterRoomBackupFiles, ContinuedRasterRoomClientArchives,
        ContinuedRasterSeal, ContinuedRasterSealing, LogGenerationHandoverStatus,
        RoomDeploymentAuthority, SealedContinuedRasterActivation, ServerRecoveryAssetProvider,
        deployment_fence,
        generation_backup::durable::{Interruption, Point},
    },
};
use breditor_collab_feasibility::rich_replica::VersionAssetReference;
use serde_json::json;
use std::fs::File;

#[path = "rotation_tests.rs"]
mod rotation_tests;
#[path = "tail_tests.rs"]
mod tail_tests;

struct Mapping<'a>(&'a str);

impl ServerRecoveryAssetProvider for Mapping<'_> {
    fn check(&self) -> crate::Result<()> {
        Ok(())
    }
    fn resolve(&self, pair: &VersionAssetReference) -> crate::Result<Option<String>> {
        assert_eq!((pair.asset.as_str(), pair.generation.as_str()), ("asset", "generation"));
        Ok(Some(self.0.to_owned()))
    }
}

#[tokio::test]
#[expect(
    clippy::too_many_lines,
    reason = "Keep the scenario and its assertions in chronological order"
)]
async fn activation_refuses_advanced_source_and_changed_mapping_then_resumes_synced_epoch()
-> TestResult {
    let (fixture, room, _) = segment_handover_test_source(3, true, true)?;
    let native = fixture.room();
    let directory = native.parent().ok_or("fixture root")?;
    let mut assets = AssetStore::open(&directory.join("initial-rasters"), room.asset_binding())?;
    let pixels = image(100)?;
    let id = asset_id(&pixels);
    assets.put(prepare_asset(&id, "image/png", pixels)?)?;
    let archive = directory.join("initial-rasters.archive");
    let original = assets.write_backup(&mut File::create_new(&archive)?)?;
    let assets = ContinuedAssetStore::create_from_backup(
        &directory.join("continued"),
        File::open(archive)?,
        &original,
    )?;
    let authority_root = directory.join("authority");
    let authority = RoomDeploymentAuthority::create_with_coordinated_recovery(
        &authority_root,
        &room.deployment_binding()?,
    )?;
    let lease = authority.claim(&authority.current_selection()?)?;
    let previous = lease.selection();
    let (token, hash) = Authentication::issue_token()?;
    let auth = || {
        Authentication::from_json(&json!({
        "format": "breditor/relay-auth", "formatVersion": 1, "origins": ["http://127.0.0.1:4187"],
        "accounts": [{"principal": "owner", "tokenHash": hash}],
    }).to_string())
    };
    let (_, handle) =
        router_with_continued_assets_and_deployment_lease(room, auth()?, assets, lease)?;
    let credentials = RecoveryRegistrationCredentials::default();
    let provider = Mapping(&id);
    let restore = |name: &str| {
        let capture = directory.join(format!("{name}-capture"));
        let selection = handle.capture("owner", &token, &capture)?;
        let backup = ContinuedRasterRoomBackupFiles::open(&capture, &selection, None)?;
        let path = directory.join(name);
        let mut target =
            backup.restore(&path, "next", ContinuedRasterRoomClientArchives::default())?;
        let report =
            target.verify_recovery_inputs(&auth()?, "owner", &token, &credentials, &provider)?;
        let approval = ContinuedRasterActivationApproval::select(&report)?;
        Ok::<_, Box<dyn std::error::Error>>((backup, target, path, approval))
    };
    let (_, target, _, stale) = restore("stale")?;
    let later = image(101)?;
    let later_id = asset_id(&later);
    let store = handle.host.continued_assets.clone().ok_or("source store")?;
    let prepared = prepare_asset(&later_id, "image/png", later)?;
    handle
        .host
        .transaction(move |room| {
            let mut store = store.lock().map_err(|_| Error::NeedsRecovery)?;
            room.put_continued_asset("owner", &mut store, prepared)
        })
        .await?;
    assert!(matches!(
        handle.activate_recovered_room(
            auth()?,
            "owner",
            &token,
            target,
            &ContinuedRasterActivation {
                approval: &stale,
                credentials: &credentials,
                provider: &provider
            }
        ),
        Err(Error::Contract("continued raster activation live source advanced"))
    ));
    assert_eq!(authority.current_selection()?, previous);

    let (backup, target, path, approval) = restore("ready")?;
    let planned = approval.planned_selection()?;
    assert!(RoomDeploymentAuthority::open_at_least(&authority_root, &planned).is_err());
    let changed = Mapping(&later_id);
    assert!(matches!(
        handle.activate_recovered_room(
            auth()?,
            "owner",
            &token,
            target,
            &ContinuedRasterActivation {
                approval: &approval,
                credentials: &credentials,
                provider: &changed
            }
        ),
        Err(Error::Contract("continued raster activation inputs changed"))
    ));
    assert_eq!(authority.current_selection()?, previous);
    let mut target = backup.reopen(&path, approval.target())?;
    assert!(matches!(
        deployment_fence::activate_continued_raster(
            &handle.host,
            &auth()?,
            "owner",
            &token,
            &mut target,
            &ContinuedRasterActivation {
                approval: &approval,
                credentials: &credentials,
                provider: &provider
            },
            &Interruption { stop: Some(Point::EpochSynced), ..Interruption::default() },
        ),
        Err(Error::Contract("injected durable handover interruption"))
    ));
    drop(target);
    assert_eq!(authority.current_selection()?, planned);
    assert!(matches!(
        handle.capture("owner", &token, &directory.join("denied")),
        Err(Error::Lease)
    ));
    assert!(authority.claim(&planned).is_err());

    let authority = RoomDeploymentAuthority::open_at_least(&authority_root, &planned)?;
    let (_, handle, next) = backup.restart_activated_room(
        &path,
        auth()?,
        "owner",
        &token,
        &ContinuedRasterRestart { authority: &authority, approval: &approval, expected: &planned },
    )?;
    assert_eq!(authority.current_selection()?, next);
    assert_eq!(next.generation.parse::<u64>()?, planned.generation.parse::<u64>()? + 1);
    assert!(handle.capture("owner", &token, &directory.join("restarted")).is_ok());
    Ok(())
}

#[test]
#[expect(
    clippy::too_many_lines,
    reason = "Keep the scenario and its assertions in chronological order"
)]
fn portable_seal_survives_lost_reply_and_refuses_changed_inputs_after_relocation() -> TestResult {
    let (fixture, room, _) = segment_handover_test_source(3, true, true)?;
    let root_path = fixture.room();
    let directory = root_path.parent().ok_or("fixture root")?;
    let mut predecessor = AssetStore::open(&directory.join("initial"), room.asset_binding())?;
    let first = image(201)?;
    let first_id = asset_id(&first);
    predecessor.put(prepare_asset(&first_id, "image/png", first)?)?;
    let archive = directory.join("predecessor.archive");
    let pin = predecessor.write_backup(&mut File::create_new(&archive)?)?;
    let mut assets = ContinuedAssetStore::create_from_backup(
        &directory.join("continued"),
        File::open(archive)?,
        &pin,
    )?;
    let other = image(202)?;
    let other_id = asset_id(&other);
    assets.put(prepare_asset(&other_id, "image/png", other)?)?;
    let epochs = directory.join("authority");
    let authority = RoomDeploymentAuthority::create_with_coordinated_recovery(
        &epochs,
        &room.deployment_binding()?,
    )?;
    let lease = authority.claim(&authority.current_selection()?)?;
    let (token, hash) = Authentication::issue_token()?;
    let auth = || {
        Authentication::from_json(&json!({
        "format": "breditor/relay-auth", "formatVersion": 1, "origins": ["http://127.0.0.1:4187"],
        "accounts": [{"principal": "owner", "tokenHash": hash}],
    }).to_string())
    };
    let (_, source) =
        router_with_continued_assets_and_deployment_lease(room, auth()?, assets, lease)?;
    let capture = directory.join("capture");
    let selection = source.capture("owner", &token, &capture)?;
    let backup = ContinuedRasterRoomBackupFiles::open(&capture, &selection, None)?;
    let credentials = RecoveryRegistrationCredentials::default();
    let provider = Mapping(&first_id);
    let mut preflight = backup.restore(
        &directory.join("preflight"),
        "preflight",
        ContinuedRasterRoomClientArchives::default(),
    )?;
    let report =
        preflight.verify_recovery_inputs(&auth()?, "owner", &token, &credentials, &provider)?;
    let seal = ContinuedRasterSeal::select(&report)?;
    let planned = seal.planned_selection()?;
    assert!(matches!(seal.status(&authority)?, LogGenerationHandoverStatus::Prepared));
    assert!(RoomDeploymentAuthority::open_at_least(&epochs, &planned).is_err());
    assert!(matches!(
        deployment_fence::seal_continued_raster(
            &source.host,
            "owner",
            &token,
            &backup,
            &mut preflight,
            &ContinuedRasterSealing { seal: &seal, credentials: &credentials, provider: &provider },
            &Interruption { stop: Some(Point::EpochSynced), ..Interruption::default() },
        ),
        Err(Error::Contract("injected durable handover interruption")),
    ));
    assert!(matches!(seal.status(&authority)?, LogGenerationHandoverStatus::Sealed));
    assert!(matches!(
        source.capture("owner", &token, &directory.join("denied")),
        Err(Error::Lease)
    ));
    assert!(authority.claim(&planned).is_err());
    drop(source);

    let cold = RoomDeploymentAuthority::open_at_least(&epochs, &planned)?;
    let path = directory.join("relocated");
    let mut target =
        backup.restore(&path, "relocated", ContinuedRasterRoomClientArchives::default())?;
    assert_ne!(target.identity(), preflight.identity());
    let report =
        target.verify_recovery_inputs(&auth()?, "owner", &token, &credentials, &provider)?;
    let approval = ContinuedRasterActivationApproval::select_sealed(&report, &seal)?;
    assert!(matches!(
        target.activate_sealed_room(
            auth()?,
            "owner",
            &token,
            &SealedContinuedRasterActivation {
                authority: &cold,
                seal: &seal,
                target: ContinuedRasterActivation {
                    approval: &approval,
                    credentials: &credentials,
                    provider: &Mapping(&other_id)
                },
            }
        ),
        Err(Error::Contract("continued raster sealed inputs differ")),
    ));
    assert_eq!(cold.current_selection()?, planned);
    let target = backup.reopen(&path, approval.target())?;
    let (_, replacement, active) = target.activate_sealed_room(
        auth()?,
        "owner",
        &token,
        &SealedContinuedRasterActivation {
            authority: &cold,
            seal: &seal,
            target: ContinuedRasterActivation {
                approval: &approval,
                credentials: &credentials,
                provider: &provider,
            },
        },
    )?;
    assert_eq!(cold.current_selection()?, active);
    assert_eq!(active, approval.planned_selection()?);
    let floor = replacement.capture("owner", &token, &directory.join("final"))?;
    drop(replacement);
    drop(backup);
    tail_tests::check_interrupted_repair(
        directory, &selection, &approval, &active, &floor, &hash, &token,
    )?;
    let backup =
        ContinuedRasterRoomBackupFiles::open(&directory.join("capture"), &selection, None)?;
    let repair_authority = RoomDeploymentAuthority::open_at_least(&epochs, &active)?;
    let restart = ContinuedRasterRestart {
        authority: &repair_authority,
        approval: &approval,
        expected: &active,
    };
    rotation_tests::check_interrupted_rotation(directory, &backup, &restart, &floor, auth, &token)?;
    Ok(())
}
