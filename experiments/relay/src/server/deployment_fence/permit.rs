//! Real shared/exclusive file-lock lifetime through blocking native work.
use super::state::State;
use crate::{Error, Result};
use std::{
    fs::{File, TryLockError},
    sync::{MutexGuard, TryLockError as MutexError, atomic::Ordering},
};
pub(super) struct Permit<'a> {
    state: &'a State,
    file: Option<MutexGuard<'a, File>>,
}
pub(super) fn lock_error(error: TryLockError) -> Error {
    match error {
        TryLockError::WouldBlock => Error::Locked,
        TryLockError::Error(error) => Error::Io(error),
    }
}
impl<'a> Permit<'a> {
    pub fn try_acquire(state: &'a State, exclusive: bool) -> Result<Self> {
        state.healthy()?;
        let file = state.file.try_lock().map_err(|e| match e {
            MutexError::WouldBlock => Error::Locked,
            MutexError::Poisoned(_) => Error::NeedsRecovery,
        })?;
        state.healthy()?;
        let locked = if exclusive { File::try_lock(&file) } else { File::try_lock_shared(&file) };
        locked.map_err(lock_error)?;
        let permit = Self { state, file: Some(file) };
        state.check_file(permit.file.as_ref().ok_or(Error::NeedsRecovery)?)?;
        Ok(permit)
    }
    pub fn serving(state: &'a State) -> Result<Self> {
        state.healthy()?;
        let file = state.file.lock().map_err(|_| Error::NeedsRecovery)?;
        state.healthy()?;
        File::lock_shared(&file)?;
        let permit = Self { state, file: Some(file) };
        state.check_file(permit.file.as_ref().ok_or(Error::NeedsRecovery)?)?;
        Ok(permit)
    }
    pub fn file(&mut self) -> Result<&mut File> {
        self.file.as_deref_mut().ok_or(Error::NeedsRecovery)
    }
    pub fn finish(mut self) -> Result<()> {
        self.release()
    }
    fn release(&mut self) -> Result<()> {
        if let Some(file) = self.file.take() {
            let result = File::unlock(&file);
            if result.is_err() {
                self.state.poisoned.store(true, Ordering::Release);
            }
            result?;
        }
        Ok(())
    }
}
impl Drop for Permit<'_> {
    fn drop(&mut self) {
        let _ = self.release();
    }
}
