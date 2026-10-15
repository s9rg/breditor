//! Stop profile collection allocation at the declared ceiling, before compilation.
use serde::{
    Deserialize, Deserializer,
    de::{IgnoredAny, SeqAccess, Visitor},
};
use std::{fmt, marker::PhantomData};

pub(super) struct Bounded<T, const N: usize>(pub Vec<T>);
impl<'de, T: Deserialize<'de>, const N: usize> Deserialize<'de> for Bounded<T, N> {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        struct Items<T, const N: usize>(PhantomData<T>);
        impl<'de, T: Deserialize<'de>, const N: usize> Visitor<'de> for Items<T, N> {
            type Value = Bounded<T, N>;
            fn expecting(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
                write!(f, "an array with at most {N} entries")
            }
            fn visit_seq<A: SeqAccess<'de>>(self, mut seq: A) -> Result<Self::Value, A::Error> {
                let mut items = Vec::new();
                while items.len() < N {
                    match seq.next_element()? {
                        Some(item) => items.push(item),
                        None => return Ok(Bounded(items)),
                    }
                }
                if seq.next_element::<IgnoredAny>()?.is_some() {
                    return Err(serde::de::Error::custom("shared profile collection limit"));
                }
                Ok(Bounded(items))
            }
        }
        deserializer.deserialize_seq(Items::<T, N>(PhantomData))
    }
}
