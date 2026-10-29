//! Private interruption boundaries; no external callback splits the real fence.
use crate::Result;
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(in crate::server) enum Point {
    ArchiveSynced,
    IntentSynced,
    SourceChecked,
    EpochSynced,
}
#[derive(Default)]
pub(in crate::server) struct Interruption {
    #[cfg(test)]
    pub barrier: Option<Barrier>,
    pub stop: Option<Point>,
    #[cfg(test)]
    pub exit_process: bool,
}
impl Interruption {
    pub fn after(&self, point: Point) -> Result<()> {
        #[cfg(test)]
        if let Some(barrier) = self.barrier.as_ref().filter(|barrier| barrier.point == point) {
            barrier.entered.send(()).map_err(|_| crate::Error::NeedsRecovery)?;
            barrier
                .release
                .lock()
                .map_err(|_| crate::Error::NeedsRecovery)?
                .recv()
                .map_err(|_| crate::Error::NeedsRecovery)?;
        }
        if self.stop == Some(point) {
            #[cfg(test)]
            if self.exit_process {
                std::process::exit(77);
            }
            return Err(crate::Error::Contract("injected durable handover interruption"));
        }
        Ok(())
    }
}

#[cfg(test)]
pub(in crate::server) struct Barrier {
    pub point: Point,
    pub entered: std::sync::mpsc::Sender<()>,
    pub release: std::sync::Mutex<std::sync::mpsc::Receiver<()>>,
}
