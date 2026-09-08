import {
  isOwnedToolbarManifest,
  type ToolbarControlDeclaration,
  type ToolbarManifest,
} from "./toolbar_manifest.js";
import {
  isOwnedBrowserCompiledProfileDescriptor,
  type BrowserCompiledProfileDescriptor,
  type BrowserProfileActionStateDescriptor,
  type BrowserProfileIntentDescriptor,
} from "./wasm_profile_descriptor.js";

/**
 * Proves that every high-level toolbar control has one exact semantic profile
 * contract. This is deliberately stricter than the low-level toolbar: direct
 * action commands remain available through the advanced API, while supported
 * editor toolbars use intents so profile routing can replace concrete actions.
 *
 * @internal
 */
export function toolbarManifestMatchesProfileDescriptor(
  manifest: unknown,
  descriptor: unknown,
): manifest is ToolbarManifest {
  if (
    !isOwnedToolbarManifest(manifest) ||
    !isOwnedBrowserCompiledProfileDescriptor(descriptor)
  ) {
    return false;
  }

  const states = new Map<string, BrowserProfileActionStateDescriptor>();
  for (const state of descriptor.actionStates) states.set(state.id, state);
  const intents = new Map<string, BrowserProfileIntentDescriptor>();
  for (const intent of descriptor.intents) intents.set(intent.id, intent);

  return manifest.controls.every((control) =>
    controlMatchesDescriptor(control, states, intents),
  );
}

function controlMatchesDescriptor(
  control: ToolbarControlDeclaration,
  states: ReadonlyMap<string, BrowserProfileActionStateDescriptor>,
  intents: ReadonlyMap<string, BrowserProfileIntentDescriptor>,
): boolean {
  const state = states.get(control.stateId);
  if (
    state === undefined ||
    state.state.activation !== control.activation ||
    state.state.value !== undefined
  ) {
    return false;
  }

  const command = control.command;
  if (command.kind === "history") {
    return control.activation === "stateless" &&
      state.source.kind === "history" &&
      state.source.direction === command.operation;
  }
  if (command.kind !== "intent" || state.source.kind !== "routed") {
    return false;
  }
  const intent = intents.get(command.intentId);
  return state.source.intentId === command.intentId &&
    intent !== undefined &&
    intent.input.kind === "none" &&
    intent.state.activation === control.activation &&
    intent.state.value === undefined;
}
