//! Opt-in complete heading command graph; the paragraph compiler stays unchanged.
use super::{CompiledEditorProfile, ProfileCompilationError, compiler};
use crate::{
    action::{
        Action, ActionId, ActionInput, ActionRegistration, ActionRegistry, ActionStateCatalog,
        ActionStateId, ActionStateRegistration, ActionStateSource,
        builtins::{
            ClearTextBlockInlineFormatsAction, DeleteTextBlockBackwardAction,
            DeleteTextBlockForwardAction, DeleteTextBlockSelectionAction,
            InsertTextBlockBreakAction, InsertTextBlockPlainTextAction, InsertTextBlockTextAction,
            SetTextBlockInlineFormatAction, SetTextBlockKindAction,
            ToggleTextBlockInlineFormatAction, clear_inline_formatting_binding_id,
            clear_inline_formatting_intent_id, clear_text_block_inline_formats_action_id,
            delete_text_block_backward_action_id, delete_text_block_forward_action_id,
            delete_text_block_selection_action_id, format_strong_binding_id,
            format_strong_intent_id, insert_plain_text_input_contract,
            insert_text_block_break_action_id, insert_text_block_plain_text_action_id,
            insert_text_block_text_action_id, insert_text_input_contract,
            set_inline_format_input_contract,
        },
        routing::{
            BindingId, BindingPriority, DisabledRouting, IntentBinding, IntentDeclaration,
            IntentId, IntentInvocation, IntentRouter,
        },
    },
    block::{HeadingLevel, TextBlockKind},
    extension::ExtensionSet,
    identity::QualifiedName,
    schema::{CompiledSchema, SchemaId},
};

pub(super) fn compile(
    schema_id: SchemaId,
    extensions: ExtensionSet,
) -> Result<CompiledEditorProfile, ProfileCompilationError> {
    compiler::validate_declaration_counts(&extensions)?;
    let schema = CompiledSchema::try_compile_text_block_profile(schema_id, &extensions)?;
    compiler::validate_declaration_targets(&extensions)?;
    compiler::validate_cross_owner_identities(&extensions)?;
    compiler::validate_reserved_identities(&extensions)?;
    let mut commands = Commands::base();
    commands.add_kinds()?;
    for manifest in extensions.manifests() {
        for toggle in manifest.inline_format_toggles() {
            commands.route(
                ActionRegistration::new(
                    toggle.action_id().clone(),
                    ToggleTextBlockInlineFormatAction::new(toggle.format_kind().clone()),
                ),
                IntentDeclaration::new(toggle.intent_id().clone())
                    .with_state_spec(ToggleTextBlockInlineFormatAction::state_spec()),
                toggle.binding_id().clone(),
                Some((toggle.action_state_id().clone(), ActionInput::None)),
            );
        }
        for set in manifest.inline_format_sets() {
            commands.route(
                ActionRegistration::with_input(
                    set.action_id().clone(),
                    set_inline_format_input_contract(),
                    SetTextBlockInlineFormatAction::new(set.format_kind().clone()),
                ),
                IntentDeclaration::with_input(
                    set.intent_id().clone(),
                    set_inline_format_input_contract(),
                )
                .with_state_spec(SetTextBlockInlineFormatAction::state_spec()),
                set.binding_id().clone(),
                Some((set.action_state_id().clone(), compiler::inline_format_presence_input()?)),
            );
        }
    }
    let router = IntentRouter::try_new(
        ActionRegistry::try_new(commands.actions)?,
        commands.intents,
        commands.bindings,
    )?;
    let states = ActionStateCatalog::try_new_with_router(router.clone(), commands.states)?;
    Ok(CompiledEditorProfile::from_compilation(extensions, schema, router, states))
}

struct Commands {
    actions: Vec<ActionRegistration>,
    intents: Vec<IntentDeclaration>,
    bindings: Vec<IntentBinding>,
    states: Vec<ActionStateRegistration>,
}
impl Commands {
    fn base() -> Self {
        let mut result = Self {
            actions: vec![
                ActionRegistration::with_input(
                    insert_text_block_text_action_id(),
                    insert_text_input_contract(),
                    InsertTextBlockTextAction,
                ),
                ActionRegistration::with_input(
                    insert_text_block_plain_text_action_id(),
                    insert_plain_text_input_contract(),
                    InsertTextBlockPlainTextAction,
                ),
                ActionRegistration::new(
                    insert_text_block_break_action_id(),
                    InsertTextBlockBreakAction,
                ),
                ActionRegistration::new(
                    delete_text_block_backward_action_id(),
                    DeleteTextBlockBackwardAction,
                ),
                ActionRegistration::new(
                    delete_text_block_forward_action_id(),
                    DeleteTextBlockForwardAction,
                ),
                ActionRegistration::new(
                    delete_text_block_selection_action_id(),
                    DeleteTextBlockSelectionAction,
                ),
            ],
            intents: vec![],
            bindings: vec![],
            states: compiler::base_action_state_registrations(),
        };
        result.route(
            ActionRegistration::new(
                ActionId::from_qualified_name(name("breditor/toggle-text-block-strong")),
                ToggleTextBlockInlineFormatAction::new(name("breditor/strong")),
            ),
            IntentDeclaration::new(format_strong_intent_id())
                .with_state_spec(ToggleTextBlockInlineFormatAction::state_spec()),
            format_strong_binding_id(),
            None,
        );
        result.route(
            ActionRegistration::new(
                clear_text_block_inline_formats_action_id(),
                ClearTextBlockInlineFormatsAction,
            ),
            IntentDeclaration::new(clear_inline_formatting_intent_id())
                .with_state_spec(ClearTextBlockInlineFormatsAction::state_spec()),
            clear_inline_formatting_binding_id(),
            None,
        );
        result
    }

    fn route(
        &mut self,
        action: ActionRegistration,
        intent: IntentDeclaration,
        binding: BindingId,
        state: Option<(ActionStateId, ActionInput)>,
    ) {
        self.bindings.push(IntentBinding::new(
            binding,
            intent.id().clone(),
            action.descriptor().id().clone(),
            BindingPriority::new(0),
            DisabledRouting::Block,
        ));
        if let Some((id, input)) = state {
            self.states.push(ActionStateRegistration::new(
                id,
                ActionStateSource::routed(IntentInvocation::new(intent.id().clone(), input)),
            ));
        }
        self.actions.push(action);
        self.intents.push(intent);
    }

    fn add_kinds(&mut self) -> Result<(), ProfileCompilationError> {
        for (rank, action, intent, binding, state) in KIND_COMMANDS {
            let target = if rank == 0 {
                TextBlockKind::Paragraph
            } else {
                TextBlockKind::Heading(
                    HeadingLevel::try_new(rank)
                        .map_err(|source| ProfileCompilationError::TextBlockKind { source })?,
                )
            };
            self.route(
                ActionRegistration::new(
                    ActionId::from_qualified_name(name(action)),
                    SetTextBlockKindAction::new(target),
                ),
                IntentDeclaration::new(IntentId::from_qualified_name(name(intent)))
                    .with_state_spec(SetTextBlockKindAction::state_spec()),
                BindingId::from_qualified_name(name(binding)),
                Some((ActionStateId::from_qualified_name(name(state)), ActionInput::None)),
            );
        }
        Ok(())
    }
}

fn name(value: &'static str) -> QualifiedName {
    QualifiedName::from_known_static(value)
}

// These are semantic identities, not labels or DOM tag names. Fixed targets
// keep kind conversion no-input, tracked and independently extensible in the UI.
const KIND_COMMANDS: [(u32, &str, &str, &str, &str); 7] = [
    (
        0,
        "breditor/set-paragraph",
        "breditor/format-paragraph",
        "breditor/format-paragraph-binding",
        "breditor/control-paragraph",
    ),
    (
        1,
        "breditor/set-heading-1",
        "breditor/format-heading-1",
        "breditor/format-heading-1-binding",
        "breditor/control-heading-1",
    ),
    (
        2,
        "breditor/set-heading-2",
        "breditor/format-heading-2",
        "breditor/format-heading-2-binding",
        "breditor/control-heading-2",
    ),
    (
        3,
        "breditor/set-heading-3",
        "breditor/format-heading-3",
        "breditor/format-heading-3-binding",
        "breditor/control-heading-3",
    ),
    (
        4,
        "breditor/set-heading-4",
        "breditor/format-heading-4",
        "breditor/format-heading-4-binding",
        "breditor/control-heading-4",
    ),
    (
        5,
        "breditor/set-heading-5",
        "breditor/format-heading-5",
        "breditor/format-heading-5-binding",
        "breditor/control-heading-5",
    ),
    (
        6,
        "breditor/set-heading-6",
        "breditor/format-heading-6",
        "breditor/format-heading-6-binding",
        "breditor/control-heading-6",
    ),
];
