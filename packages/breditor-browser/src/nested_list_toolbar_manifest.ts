import { createToolbarManifest, type ToolbarButtonDeclaration } from "./toolbar_manifest.js";

/**
 * Opt-in nested-list beta controls. All structural buttons invoke named intents,
 * so extension routing remains profile-owned rather than embedded in the UI.
 * Hosts may compose a different manifest; verify it against their descriptor.
 * Not included in the default paragraph toolbar. @internal
 */
export const NESTED_LIST_TOOLBAR_MANIFEST = createToolbarManifest({
  label: "Editor controls",
  controls: [
    intent("bold", "Bold", "format-strong", "inline"),
    intent("clear-inline-formatting", "Clear formatting", "clear-inline-formatting", "inline", "stateless"),
    intent("paragraph", "Paragraph", "format-paragraph", "blocks"),
    ...Array.from({length: 6}, (_, index) => {
      const rank = index + 1;
      return intent(`heading-${rank}`, `Heading ${rank}`, `format-heading-${rank}`, "blocks");
    }),
    intent("bullet-list", "Bullet list", "format-bullet-list", "lists"),
    intent("ordered-list", "Numbered list", "format-ordered-list", "lists"),
    intent("remove-list", "Remove list", "remove-list", "lists"),
    intent("indent-list-items", "Indent", "indent-list-items", "nesting"),
    intent("outdent-list-items", "Outdent", "outdent-list-items", "nesting"),
    {kind: "button", stateId: "breditor/control-undo", label: "Undo", activation: "stateless", group: "history",
      command: {kind: "history", operation: "undo"}},
    {kind: "button", stateId: "breditor/control-redo", label: "Redo", activation: "stateless", group: "history",
      command: {kind: "history", operation: "redo"}},
  ],
});

function intent(state: string, label: string, target: string, group: string,
  activation: "tracked" | "stateless" = "tracked"): ToolbarButtonDeclaration {
  return {kind: "button", stateId: `breditor/control-${state}`, label, activation, group,
    command: {kind: "intent", intentId: `breditor/${target}`}};
}
