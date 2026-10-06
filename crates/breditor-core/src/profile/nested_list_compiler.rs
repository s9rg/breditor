//! Opt-in complete nested-list command graph; the paragraph compiler stays unchanged.
use super::{CompiledEditorProfile, ProfileCompilationError, compiler};
use crate::{
    action::{
        Action, ActionId, ActionInput, ActionRegistration, ActionRegistry, ActionStateCatalog,
        ActionStateId, ActionStateRegistration, ActionStateSource,
        builtins::{
            ClearNestedListInlineFormatsAction, DeleteNestedListBackwardAction,
            DeleteNestedListForwardAction, DeleteNestedListSelectionAction, IndentListItemsAction,
            InsertNestedListBreakAction, InsertNestedListPlainTextAction,
            InsertNestedListTextAction, OutdentListItemsAction, SetNestedListBlockKindAction,
            SetNestedListInlineFormatAction, ToggleNestedListInlineFormatAction,
            UnwrapNestedListAction, WrapNestedListAction, clear_inline_formatting_binding_id,
            clear_inline_formatting_intent_id, clear_nested_list_inline_formats_action_id,
            delete_nested_list_backward_action_id, delete_nested_list_forward_action_id,
            delete_nested_list_selection_action_id, format_strong_binding_id,
            format_strong_intent_id, insert_nested_list_break_action_id,
            insert_nested_list_plain_text_action_id, insert_nested_list_text_action_id,
            insert_plain_text_input_contract, insert_text_input_contract,
            set_inline_format_input_contract,
        },
        routing::{
            BindingId, BindingPriority, DisabledRouting, IntentBinding, IntentDeclaration,
            IntentId, IntentInvocation, IntentRouter,
        },
    },
    block::{HeadingLevel, ListKind, OrderedListStart, TextBlockKind},
    extension::ExtensionSet,
    identity::QualifiedName,
    schema::{CompiledSchema, SchemaId},
};

pub(super) fn compile(
    schema_id: SchemaId,
    extensions: ExtensionSet,
) -> Result<CompiledEditorProfile, ProfileCompilationError> {
    compiler::validate_declaration_counts(&extensions)?;
    let schema = CompiledSchema::try_compile_nested_list_profile(schema_id, &extensions)?;
    compiler::validate_declaration_targets(&extensions)?;
    compiler::validate_cross_owner_identities(&extensions)?;
    compiler::validate_reserved_identities(&extensions)?;
    let mut commands = Commands::base();
    commands.add_kinds()?;
    commands.add_lists();
    commands.add_nesting();
    for manifest in extensions.manifests() {
        for toggle in manifest.inline_format_toggles() {
            commands.route(
                ActionRegistration::new(
                    toggle.action_id().clone(),
                    ToggleNestedListInlineFormatAction::new(toggle.format_kind().clone()),
                ),
                IntentDeclaration::new(toggle.intent_id().clone())
                    .with_state_spec(ToggleNestedListInlineFormatAction::state_spec()),
                toggle.binding_id().clone(),
                Some((toggle.action_state_id().clone(), ActionInput::None)),
            );
        }
        for set in manifest.inline_format_sets() {
            commands.route(
                ActionRegistration::with_input(
                    set.action_id().clone(),
                    set_inline_format_input_contract(),
                    SetNestedListInlineFormatAction::new(set.format_kind().clone()),
                ),
                IntentDeclaration::with_input(
                    set.intent_id().clone(),
                    set_inline_format_input_contract(),
                )
                .with_state_spec(SetNestedListInlineFormatAction::state_spec()),
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
                    insert_nested_list_text_action_id(),
                    insert_text_input_contract(),
                    InsertNestedListTextAction,
                ),
                ActionRegistration::with_input(
                    insert_nested_list_plain_text_action_id(),
                    insert_plain_text_input_contract(),
                    InsertNestedListPlainTextAction,
                ),
                ActionRegistration::new(
                    insert_nested_list_break_action_id(),
                    InsertNestedListBreakAction,
                ),
                ActionRegistration::new(
                    delete_nested_list_backward_action_id(),
                    DeleteNestedListBackwardAction,
                ),
                ActionRegistration::new(
                    delete_nested_list_forward_action_id(),
                    DeleteNestedListForwardAction,
                ),
                ActionRegistration::new(
                    delete_nested_list_selection_action_id(),
                    DeleteNestedListSelectionAction,
                ),
            ],
            intents: vec![],
            bindings: vec![],
            states: compiler::base_action_state_registrations(),
        };
        result.route(
            ActionRegistration::new(
                ActionId::from_qualified_name(name("breditor/toggle-nested-list-strong")),
                ToggleNestedListInlineFormatAction::new(name("breditor/strong")),
            ),
            IntentDeclaration::new(format_strong_intent_id())
                .with_state_spec(ToggleNestedListInlineFormatAction::state_spec()),
            format_strong_binding_id(),
            None,
        );
        result.route(
            ActionRegistration::new(
                clear_nested_list_inline_formats_action_id(),
                ClearNestedListInlineFormatsAction,
            ),
            IntentDeclaration::new(clear_inline_formatting_intent_id())
                .with_state_spec(ClearNestedListInlineFormatsAction::state_spec()),
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

    fn add_nesting(&mut self) {
        for (action, intent, binding, state, spec) in [
            (
                ActionRegistration::new(
                    ActionId::from_qualified_name(name("breditor/indent-list-items")),
                    IndentListItemsAction,
                ),
                "breditor/indent-list-items",
                "breditor/indent-list-items-binding",
                "breditor/control-indent-list-items",
                IndentListItemsAction::state_spec(),
            ),
            (
                ActionRegistration::new(
                    ActionId::from_qualified_name(name("breditor/outdent-list-items")),
                    OutdentListItemsAction,
                ),
                "breditor/outdent-list-items",
                "breditor/outdent-list-items-binding",
                "breditor/control-outdent-list-items",
                OutdentListItemsAction::state_spec(),
            ),
        ] {
            self.route(
                action,
                IntentDeclaration::new(IntentId::from_qualified_name(name(intent)))
                    .with_state_spec(spec),
                BindingId::from_qualified_name(name(binding)),
                Some((ActionStateId::from_qualified_name(name(state)), ActionInput::None)),
            );
        }
    }

    fn add_lists(&mut self) {
        for (target, action, intent, binding, state) in [
            (
                ListKind::Bullet,
                "breditor/wrap-bullet-list",
                "breditor/format-bullet-list",
                "breditor/format-bullet-list-binding",
                "breditor/control-bullet-list",
            ),
            (
                ListKind::Ordered(OrderedListStart::one()),
                "breditor/wrap-ordered-list",
                "breditor/format-ordered-list",
                "breditor/format-ordered-list-binding",
                "breditor/control-ordered-list",
            ),
        ] {
            self.route(
                ActionRegistration::new(
                    ActionId::from_qualified_name(name(action)),
                    WrapNestedListAction::new(target),
                ),
                IntentDeclaration::new(IntentId::from_qualified_name(name(intent)))
                    .with_state_spec(WrapNestedListAction::state_spec()),
                BindingId::from_qualified_name(name(binding)),
                Some((ActionStateId::from_qualified_name(name(state)), ActionInput::None)),
            );
        }
        self.route(
            ActionRegistration::new(
                ActionId::from_qualified_name(name("breditor/unwrap-list")),
                UnwrapNestedListAction,
            ),
            IntentDeclaration::new(IntentId::from_qualified_name(name("breditor/remove-list")))
                .with_state_spec(UnwrapNestedListAction::state_spec()),
            BindingId::from_qualified_name(name("breditor/remove-list-binding")),
            Some((
                ActionStateId::from_qualified_name(name("breditor/control-remove-list")),
                ActionInput::None,
            )),
        );
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
                    SetNestedListBlockKindAction::new(target),
                ),
                IntentDeclaration::new(IntentId::from_qualified_name(name(intent)))
                    .with_state_spec(SetNestedListBlockKindAction::state_spec()),
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
