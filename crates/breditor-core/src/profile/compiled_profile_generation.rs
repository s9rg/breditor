use std::{fmt, sync::Arc};

/// Opaque process-local identity of one compiled editor profile generation.
///
/// Clones retain allocation identity and independently compiled profiles always
/// receive distinct generations, even when all declarative inputs are equal.
/// The value has no ordering, counter, or wire representation. At alpha.4 it
/// identifies only the immutable profile container; engine and observation
/// carriage begins with the profile-aware runtime boundary in alpha.5.
#[derive(Clone)]
pub struct CompiledProfileGeneration(Arc<CompiledProfileGenerationIdentity>);

impl CompiledProfileGeneration {
    pub(super) fn fresh() -> Self {
        Self(Arc::new(CompiledProfileGenerationIdentity))
    }
}

impl fmt::Debug for CompiledProfileGeneration {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.debug_struct("CompiledProfileGeneration").finish_non_exhaustive()
    }
}

impl PartialEq for CompiledProfileGeneration {
    fn eq(&self, other: &Self) -> bool {
        Arc::ptr_eq(&self.0, &other.0)
    }
}

impl Eq for CompiledProfileGeneration {}

struct CompiledProfileGenerationIdentity;

#[cfg(test)]
mod tests {
    use super::CompiledProfileGeneration;

    #[test]
    fn clones_retain_identity_and_fresh_generations_are_distinct() {
        let first = CompiledProfileGeneration::fresh();
        let clone = first.clone();
        let second = CompiledProfileGeneration::fresh();

        assert_eq!(first, clone);
        assert_ne!(first, second);
    }

    #[test]
    fn debug_output_discloses_no_identity_material() {
        let generation = CompiledProfileGeneration::fresh();

        assert_eq!(format!("{generation:?}"), "CompiledProfileGeneration { .. }");
    }
}
