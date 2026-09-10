import {
  isOwnedToolbarManifest,
  type ToolbarButtonDeclaration,
  type ToolbarInlineFormatFormDeclaration,
  type ToolbarManifest,
} from "./toolbar_manifest.js";
import {
  isOwnedBrowserCompiledProfileDescriptor,
  type BrowserCompiledProfileDescriptor,
  type BrowserProfileActionStateDescriptor,
  type BrowserProfileFormatDescriptor,
  type BrowserProfileInlineFormatSetDescriptor,
  type BrowserProfileIntentDescriptor,
} from "./wasm_profile_descriptor.js";

const SET_INLINE_FORMAT_INPUT_CONTRACT_NAME =
  "breditor/set-inline-format-input";
const SET_INLINE_FORMAT_INPUT_CONTRACT_VERSION = 1;

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
  const formats = new Map<string, BrowserProfileFormatDescriptor>();
  for (const format of descriptor.formats) formats.set(format.kind, format);
  const inlineFormatSets = new Map<
    string,
    BrowserProfileInlineFormatSetDescriptor
  >();
  for (const declaration of descriptor.inlineFormatSets) {
    inlineFormatSets.set(declaration.formatKind, declaration);
  }

  return manifest.controls.every((control) => {
    if (control.kind === "inlineFormatForm") {
      return inlineFormatFormMatchesDescriptor(
        control,
        states,
        intents,
        formats,
        inlineFormatSets,
      );
    }
    return buttonMatchesDescriptor(control, states, intents);
  });
}

function buttonMatchesDescriptor(
  control: ToolbarButtonDeclaration,
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

function inlineFormatFormMatchesDescriptor(
  control: ToolbarInlineFormatFormDeclaration,
  states: ReadonlyMap<string, BrowserProfileActionStateDescriptor>,
  intents: ReadonlyMap<string, BrowserProfileIntentDescriptor>,
  formats: ReadonlyMap<string, BrowserProfileFormatDescriptor>,
  inlineFormatSets: ReadonlyMap<
    string,
    BrowserProfileInlineFormatSetDescriptor
  >,
): boolean {
  const state = states.get(control.stateId);
  const intent = intents.get(control.intentId);
  const format = formats.get(control.formatKind);
  const inlineFormatSet = inlineFormatSets.get(control.formatKind);
  if (
    state === undefined ||
    state.source.kind !== "routed" ||
    state.source.intentId !== control.intentId ||
    state.state.activation !== "tracked" ||
    state.state.value !== undefined ||
    intent === undefined ||
    intent.input.kind !== "typed" ||
    intent.input.contract.name !== SET_INLINE_FORMAT_INPUT_CONTRACT_NAME ||
    intent.input.contract.version !== SET_INLINE_FORMAT_INPUT_CONTRACT_VERSION ||
    intent.state.activation !== "tracked" ||
    intent.state.value !== undefined ||
    format === undefined ||
    inlineFormatSet === undefined ||
    inlineFormatSet.intentId !== control.intentId ||
    inlineFormatSet.actionStateId !== control.stateId ||
    format.properties.length !== control.fields.length
  ) {
    return false;
  }

  const fields = new Map(control.fields.map((field) => [field.propertyName, field]));
  if (fields.size !== control.fields.length) return false;
  return format.properties.every((property) => {
    if (property.presence !== "required") return false;
    const field = fields.get(property.name);
    if (field === undefined || field.kind !== property.valueType.kind) return false;
    if (field.kind === "boolean") return field.defaultValue === false;
    return property.valueType.kind === "string" &&
      field.minimumUtf8Bytes === property.valueType.minimumUtf8Bytes &&
      field.maximumUtf8Bytes === property.valueType.maximumUtf8Bytes;
  });
}
