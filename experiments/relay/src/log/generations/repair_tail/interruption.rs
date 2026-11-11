//! Repair checkpoints used by real child-process tests.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum NativeTailRepairPoint {
    BeforeTruncate,
    Truncated,
    Synced,
}

#[derive(Clone, Copy, Default)]
pub(crate) struct NativeTailRepairInterruption {
    #[cfg(test)]
    pub(crate) pause: Option<NativeTailRepairPoint>,
}

impl NativeTailRepairInterruption {
    pub(super) fn reached(self, point: NativeTailRepairPoint) {
        #[cfg(test)]
        if self.pause == Some(point) {
            use std::io::Write;

            // Notify the parent without syncing anything on the fixture filesystem.
            let mut stdout = std::io::stdout().lock();
            writeln!(stdout, "\nBREDITOR_NATIVE_TAIL_REPAIR_HELD {}", point.name())
                .expect("notify native tail repair test");
            stdout.flush().expect("flush native tail repair notification");
            drop(stdout);
            loop {
                std::thread::park();
            }
        }
        #[cfg(not(test))]
        let _ = (self, point);
    }
}

#[cfg(test)]
impl NativeTailRepairPoint {
    pub(crate) const fn name(self) -> &'static str {
        match self {
            Self::BeforeTruncate => "before-truncate",
            Self::Truncated => "truncated",
            Self::Synced => "synced",
        }
    }
}
