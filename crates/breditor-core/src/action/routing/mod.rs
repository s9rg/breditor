//! Deterministic routing from host-normalized semantic intents to pure actions.
//!
//! The router validates an explicit, frozen declaration graph over an immutable
//! [`super::ActionRegistry`]. It owns semantic priority and expected-disabled
//! fallback, while actions remain the sole applicability and transaction-planning
//! authority. Browser events, key syntax, toolbar layout, transforms, mutable
//! guards, and replay protocols remain outside this contract.
//!
//! # Routing and publishing an intent
//!
//! ```no_run
//! use breditor_core::{
//!     action::{
//!         builtins::{base_action_registry, insert_paragraph_break_action_id},
//!         routing::{
//!             BindingId, BindingPriority, DisabledRouting, IntentBinding,
//!             IntentDeclaration, IntentExecutionOutcome, IntentId, IntentInvocation,
//!             IntentRouter,
//!         },
//!     },
//!     session::EditorSession,
//! };
//!
//! fn insert_paragraph(
//!     session: &mut EditorSession,
//! ) -> Result<IntentExecutionOutcome, Box<dyn std::error::Error>> {
//!     let intent = IntentId::try_new("breditor/insert-paragraph")?;
//!     let router = IntentRouter::try_new(
//!         base_action_registry()?,
//!         vec![IntentDeclaration::without_input(intent.clone())],
//!         vec![IntentBinding::new(
//!             BindingId::try_new("breditor/base-insert-paragraph")?,
//!             intent.clone(),
//!             insert_paragraph_break_action_id(),
//!             BindingPriority::default(),
//!             DisabledRouting::Block,
//!         )],
//!     )?;
//!     let route = router.route(session.state(), &IntentInvocation::without_input(intent))?;
//!     Ok(session.execute_intent_route(route)?)
//! }
//! ```

mod binding;
mod binding_id;
mod declaration;
mod error;
mod execution_outcome;
mod intent_id;
mod invocation;
mod limits;
mod outcome;
mod priority;
mod router;
mod trace;

pub use binding::{DisabledRouting, IntentBinding};
pub use binding_id::BindingId;
pub use declaration::IntentDeclaration;
pub use error::{IntentRouteBaseError, IntentRouteError, IntentRouterError};
pub use execution_outcome::IntentExecutionOutcome;
pub use intent_id::IntentId;
pub use invocation::IntentInvocation;
pub use limits::{MAX_BINDINGS_PER_INTENT, MAX_INTENT_BINDINGS, MAX_INTENT_DECLARATIONS};
pub use outcome::{BlockedIntent, IntentRouteOutcome, RoutedAction, UnhandledIntent};
pub use priority::BindingPriority;
pub use router::IntentRouter;
pub use trace::IntentFallThrough;
