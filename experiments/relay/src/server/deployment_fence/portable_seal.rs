//! Stop exactly the current portable cut under the same authority as serving transactions.
use super::{RoomDeploymentSelection, permit::Permit};
use crate::{
    Error, Result,
    server::{
        Host, RelaySegmentPortableSeal,
        generation_backup::durable::{Interruption, Point},
        segment_handover::NamedPortableBackup,
    },
};
use std::io::sink;

pub(in crate::server) fn seal_portable_segment(
    host: &Host,
    principal: &str,
    intent: &RelaySegmentPortableSeal,
    bundle: &NamedPortableBackup,
    stop: &Interruption,
) -> Result<RoomDeploymentSelection> {
    let expected = &intent.backup().retained;
    let planned = intent.planned_selection()?;
    host.deployment.fenced(|old| {
        if old.selection() != expected.source_epoch {
            return Err(Error::Lease);
        }
        let authority = old.authority();
        let mut epoch = Permit::try_acquire(&authority.state, true)?;
        old.check_held(&mut epoch)?;
        bundle.check_files()?;
        if bundle.identity() != &expected.backup {
            return Err(Error::Contract("portable relay seal backup differs"));
        }
        if let Some(custody) = &host.relay_segment_custody {
            custody.check_portable_input_roster(expected)?;
        } else if !expected.selected_journals.is_empty()
            || !expected.alternate_journals.is_empty()
            || !expected.standalone_uploads.is_empty()
        {
            return Err(Error::Contract("portable relay retained inputs differ"));
        }
        let mut room = host.room.lock().map_err(|_| Error::NeedsRecovery)?;
        let assets = host.assets.as_ref().ok_or(Error::NeedsRecovery)?;
        let assets = assets.lock().map_err(|_| Error::NeedsRecovery)?;
        let (current, rasters) = room.write_relay_segment_room_backup_with_custody(
            principal,
            &assets,
            &mut sink(),
            &mut sink(),
            &mut sink(),
            bundle.checkpoint_encoding(),
        )?;
        if current != expected.backup {
            return Err(Error::Contract("portable relay seal source cut advanced"));
        }
        stop.after(Point::SourceChecked)?;
        bundle.check_files()?;
        rasters.check()?;
        if let Some(custody) = &host.relay_segment_custody {
            custody.check_portable_input_roster(expected)?;
        }
        old.check_held(&mut epoch)?;
        let seal = authority.claim_activation_held(
            &mut epoch,
            &expected.source_epoch,
            intent.nonce()?,
            stop,
        )?;
        old.close();
        seal.close();
        if seal.selection() != planned {
            return Err(Error::NeedsRecovery);
        }
        epoch.finish()?;
        authority.state.healthy()?;
        Ok(planned)
    })
}
