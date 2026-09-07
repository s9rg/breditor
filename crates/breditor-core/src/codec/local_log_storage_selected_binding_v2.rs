use crate::schema::DurableSchemaBinding;

use super::{
    LocalLogStorageSelectedActiveGenerationBindingV2, LocalLogStorageSelectedBinding,
    LocalLogStorageSelectedBindingError, LocalLogStorageSelectedCheckpointGenerationBindingV2,
    LocalLogStorageSelectionReceiptBinding,
};

/// Complete scalar binding for one exact Storage V2 selection envelope.
///
/// This public wrapper exposes only Frame V2 generation facts. Its internal
/// compatibility representation remains inaccessible to callers.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LocalLogStorageSelectedBindingV2 {
    inner: LocalLogStorageSelectedBinding,
    checkpoint_generation: LocalLogStorageSelectedCheckpointGenerationBindingV2,
    active_generation: LocalLogStorageSelectedActiveGenerationBindingV2,
}

impl LocalLogStorageSelectedBindingV2 {
    /// Validates and creates one complete V2 selection-envelope binding.
    ///
    /// # Errors
    ///
    /// Rejects invalid receipt continuity, generation topology, schema drift,
    /// identity reuse, or activation-fence reuse.
    pub fn try_new(
        current_receipt: LocalLogStorageSelectionReceiptBinding,
        predecessor_receipt: Option<LocalLogStorageSelectionReceiptBinding>,
        checkpoint_generation: LocalLogStorageSelectedCheckpointGenerationBindingV2,
        active_generation: LocalLogStorageSelectedActiveGenerationBindingV2,
    ) -> Result<Self, LocalLogStorageSelectedBindingError> {
        let inner = LocalLogStorageSelectedBinding::try_new(
            current_receipt,
            predecessor_receipt,
            checkpoint_generation.inner().clone(),
            active_generation.inner().clone(),
        )?;
        Ok(Self { inner, checkpoint_generation, active_generation })
    }

    pub(super) const fn inner(&self) -> &LocalLogStorageSelectedBinding {
        &self.inner
    }

    /// Returns the durable schema identity retained by the selected edge.
    #[must_use]
    pub const fn schema_binding(&self) -> &DurableSchemaBinding {
        self.inner.schema_binding()
    }

    /// Returns the envelope tip's exact transaction receipt.
    #[must_use]
    pub const fn current_receipt(&self) -> &LocalLogStorageSelectionReceiptBinding {
        self.inner.current_receipt()
    }

    /// Returns the exact predecessor receipt, present only for a rotation.
    #[must_use]
    pub const fn predecessor_receipt(&self) -> Option<&LocalLogStorageSelectionReceiptBinding> {
        self.inner.predecessor_receipt()
    }

    /// Returns the complete checkpoint Frame V2 generation facts.
    #[must_use]
    pub const fn checkpoint_generation(
        &self,
    ) -> &LocalLogStorageSelectedCheckpointGenerationBindingV2 {
        &self.checkpoint_generation
    }

    /// Returns the complete active Frame V2 generation facts.
    #[must_use]
    pub const fn active_generation(&self) -> &LocalLogStorageSelectedActiveGenerationBindingV2 {
        &self.active_generation
    }
}
