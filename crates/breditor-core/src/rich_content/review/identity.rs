//! Review identities are typed; event counters serialize only as exact decimal strings.
use super::ReviewError;
use serde::{Deserialize, Deserializer, Serialize, de::Error as _};

macro_rules! identity {
    ($name:ident, $doc:literal, $check:expr) => {
        #[doc = $doc]
        #[derive(Clone, Debug, Eq, PartialEq, Ord, PartialOrd, Hash, Serialize)]
        #[serde(transparent)]
        pub struct $name(String);
        impl $name {
            /// Validate an opaque host identity; this does not establish ownership or permission.
            /// # Errors
            /// Rejects identities outside this type's bounded spelling contract.
            pub fn try_new(value: impl Into<String>) -> Result<Self, ReviewError> {
                let value = value.into();
                if !($check)(&value) {
                    return Err(ReviewError::Identity);
                }
                Ok(Self(value))
            }
            /// Exact identity bytes, never a display name or credential.
            #[must_use]
            pub fn as_str(&self) -> &str {
                &self.0
            }
        }
        impl<'de> Deserialize<'de> for $name {
            fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
                Self::try_new(String::deserialize(d)?).map_err(D::Error::custom)
            }
        }
    };
}
fn actor(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && value.as_bytes()[0].is_ascii_alphanumeric()
        && value.bytes().all(|b| b.is_ascii_alphanumeric() || b"._:-".contains(&b))
}
fn principal(value: &str) -> bool {
    !value.trim().is_empty() && value.len() <= 256 && !value.chars().any(char::is_control)
}
identity!(ReviewActorId, "One durably exclusive review writer, not an account claim.", actor);
identity!(
    ReviewPrincipalId,
    "Exact host account identity, separate from its display label.",
    principal
);

#[derive(Clone, Copy, Debug, Eq, PartialEq, Ord, PartialOrd, Serialize)]
pub(super) struct Counter(#[serde(with = "decimal")] pub u64);
impl<'de> Deserialize<'de> for Counter {
    fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        let value = decimal::deserialize(d)?;
        if value == 0 {
            return Err(D::Error::custom("positive review counter"));
        }
        Ok(Self(value))
    }
}
/// One immutable event in a durably exclusive review writer's causal stream.
#[derive(Clone, Debug, Eq, PartialEq, Ord, PartialOrd, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ReviewEventId {
    pub(super) actor: ReviewActorId,
    pub(super) counter: Counter,
}
impl ReviewEventId {
    /// Bind an exact positive counter to a host-owned actor identity.
    /// # Errors
    /// Zero is not a review event.
    pub fn try_new(actor: ReviewActorId, counter: u64) -> Result<Self, ReviewError> {
        if counter == 0 {
            return Err(ReviewError::Identity);
        }
        Ok(Self { actor, counter: Counter(counter) })
    }
    /// The event's writer, not an authenticated account name.
    #[must_use]
    pub const fn actor(&self) -> &ReviewActorId {
        &self.actor
    }
    /// Exact integer counter; browser wire values remain strings.
    #[must_use]
    pub const fn counter(&self) -> u64 {
        self.counter.0
    }
}
macro_rules! birth_id {
    ($name:ident, $doc:literal) => {
        #[doc = $doc]
        #[derive(Clone, Debug, Eq, PartialEq, Ord, PartialOrd, Serialize, Deserialize)]
        #[serde(transparent)]
        pub struct $name(pub(super) ReviewEventId);
        impl $name {
            /// Reference a birth event; lookup still verifies that its action has the right kind.
            #[must_use]
            pub const fn from_event(event: ReviewEventId) -> Self {
                Self(event)
            }
            /// Immutable source event identity.
            #[must_use]
            pub const fn event(&self) -> &ReviewEventId {
                &self.0
            }
        }
    };
}
birth_id!(
    ReviewThreadId,
    "A thread identity is its immutable creation event, not a reusable name."
);
birth_id!(ReviewMessageId, "A message identity is its immutable creation or reply event.");

mod decimal {
    use serde::{Deserialize, Deserializer, Serializer, de::Error as _};
    #[allow(clippy::trivially_copy_pass_by_ref)]
    pub(super) fn serialize<S: Serializer>(value: &u64, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&value.to_string())
    }
    pub(super) fn deserialize<'de, D: Deserializer<'de>>(d: D) -> Result<u64, D::Error> {
        let text = String::deserialize(d)?;
        let value = text.parse::<u64>().map_err(D::Error::custom)?;
        if text != value.to_string() {
            return Err(D::Error::custom("canonical review counter"));
        }
        Ok(value)
    }
}
