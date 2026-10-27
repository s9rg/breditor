//! Closed host-supplied historical windows, bound to exact authenticated peer lineage.
use super::error;
use breditor_core::rich_content::review::{
    ReviewAccess, ReviewActorId, ReviewActorPolicy, ReviewError, ReviewEventId, ReviewPrincipalId,
    ReviewSession,
};
use serde::Deserialize;
use wasm_bindgen::JsValue;
const MAX_BYTES: usize = 4 * 1024 * 1024;
const MAX_WINDOWS: usize = 4096;
#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Request {
    format: String,
    format_version: u32,
    authorizations: Vec<Window>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Window {
    source: HostPolicy,
    from: String,
    through: String,
    prefix_digest: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct HostPolicy {
    actor: ReviewActorId,
    principal: ReviewPrincipalId,
    access: Access,
}
#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "snake_case")]
enum Access {
    ReadOnly,
    Comment,
    Moderate,
}
impl From<Access> for ReviewAccess {
    fn from(value: Access) -> Self {
        match value {
            Access::ReadOnly => Self::ReadOnly,
            Access::Comment => Self::Comment,
            Access::Moderate => Self::Moderate,
        }
    }
}
struct Admitted {
    policy: ReviewActorPolicy,
    from: u64,
    through: u64,
}
pub(super) struct Authorizations {
    windows: Vec<Admitted>,
}
fn counter(value: &str) -> Result<u64, JsValue> {
    let parsed = value.parse::<u64>().map_err(|_| error("native branch authorization counter"))?;
    if parsed == 0 || parsed.to_string() != value {
        return Err(error("native branch authorization counter"));
    }
    Ok(parsed)
}
impl Authorizations {
    pub(super) fn admit(input: &str, source: Option<&ReviewSession>) -> Result<Self, JsValue> {
        if input.len() > MAX_BYTES {
            return Err(error("native branch authorization bytes"));
        }
        let request: Request = serde_json::from_str(input).map_err(error)?;
        if request.format != "breditor/native-branch-union-authorizations"
            || request.format_version != 1
            || request.authorizations.len() > MAX_WINDOWS
        {
            return Err(error("native branch authorizations"));
        }
        let mut windows = Vec::<Admitted>::new();
        for window in request.authorizations {
            let review =
                source.ok_or_else(|| error("native branch authorization has no review lane"))?;
            let from = counter(&window.from)?;
            let through = counter(&window.through)?;
            if from > through {
                return Err(error("native branch authorization range"));
            }
            // The host supplies this prefix from its separately authenticated original
            // history. Native content can never manufacture an accepted lineage grant.
            if review
                .writer_clock_at(&window.source.actor, &window.source.principal, through)
                .map_err(error)?
                .prefix_digest
                != window.prefix_digest
            {
                return Err(error("native branch authorization lineage"));
            }
            let policy = ReviewActorPolicy {
                actor: window.source.actor,
                principal: window.source.principal,
                access: window.source.access.into(),
            };
            if windows.iter().any(|old| {
                old.policy.actor == policy.actor
                    && (old.policy.principal != policy.principal
                        || old.from <= through && from <= old.through)
            }) {
                return Err(error("native branch authorization overlap or principal differs"));
            }
            windows.push(Admitted { policy, from, through });
        }
        Ok(Self { windows })
    }
    pub(super) fn event(
        &self,
        id: &ReviewEventId,
        principal: &ReviewPrincipalId,
    ) -> Result<ReviewActorPolicy, ReviewError> {
        self.windows
            .iter()
            .find(|window| {
                window.policy.actor == *id.actor()
                    && window.policy.principal == *principal
                    && window.from <= id.counter()
                    && id.counter() <= window.through
            })
            .map(|window| window.policy.clone())
            .ok_or(ReviewError::Permission)
    }
}
