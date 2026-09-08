type NativeGetter = (this: unknown) => unknown;
type NativeMethod = (this: unknown, ...args: unknown[]) => unknown;

const MAX_EVENT_PROTOTYPE_DEPTH = 64;

/** Distinguishes platform-branded events from explicit plain-object fixtures. */
export type DomEventSource = "native" | "structural";

/** Target-free Event facts for snapshotters which must not retain identity. */
export interface DomEventStatusSnapshot {
  readonly source: DomEventSource;
  readonly type: string;
  readonly cancelable: boolean;
  readonly defaultPrevented: boolean;
}

/** Bounded primitive/identity facts shared by browser event controllers. */
export interface DomEventBaseSnapshot extends DomEventStatusSnapshot {
  readonly target: EventTarget | null;
}

/** InputEvent-specific fields, detached from the native event object. */
export interface DomInputEventFields {
  readonly source: DomEventSource;
  readonly inputType: string;
  readonly data: string | null;
  readonly isComposing: boolean;
}

/** KeyboardEvent-specific fields, detached from the native event object. */
export interface DomKeyboardEventFields {
  readonly source: DomEventSource;
  readonly key: string;
  readonly code: string;
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly repeat: boolean;
  readonly isComposing: boolean;
  readonly keyCode: number;
  readonly altGraph: boolean;
}

/** CompositionEvent data together with the independently proven Event base. */
export interface DomCompositionEventSnapshot {
  readonly base: DomEventBaseSnapshot;
  readonly data: unknown;
}

/** ClipboardEvent data together with the independently proven Event base. */
export interface DomClipboardEventSnapshot {
  readonly base: DomEventBaseSnapshot;
  readonly clipboardData: unknown;
}

/** MouseEvent facts used by toolbar pointer/mouse/click routing. */
export interface DomMouseEventSnapshot {
  readonly base: DomEventBaseSnapshot;
  readonly button: number;
}

export type DomEventValueRead =
  | Readonly<{ ok: true; value: unknown }>
  | Readonly<{ ok: false }>;

export type DomEventCancellation =
  | Readonly<{ ok: true; defaultPrevented: true }>
  | Readonly<{ ok: false; defaultPrevented: boolean }>;

/** Result of one DataTransfer read, before controller-specific validation. */
export type DomDataTransferValueRead =
  | Readonly<{ ok: true; source: DomEventSource; value: unknown }>
  | Readonly<{ ok: false }>;

/** Result of one DataTransfer mutation boundary. */
export type DomDataTransferMutation =
  | Readonly<{ ok: true; source: DomEventSource }>
  | Readonly<{ ok: false }>;

/**
 * Reads Event facts without consulting own or host-local prototype shadows on
 * a platform-branded Event. Plain-object test/adapter fixtures take an
 * explicitly separate structural path whose failures remain total.
 */
export function readDomEventBase(value: unknown): DomEventBaseSnapshot | null {
  const status = readDomEventStatus(value);
  if (status === null || !objectLike(value)) return null;
  try {
    const target = status.source === "native"
      ? applyRealmGetter("Event", "target", value)
      : Reflect.get(value, "target", value) as unknown;
    return target === null || typeof target === "object"
      ? Object.freeze({
          source: status.source,
          type: status.type,
          target: target as EventTarget | null,
          cancelable: status.cancelable,
          defaultPrevented: status.defaultPrevented,
        })
      : null;
  } catch {
    return null;
  }
}

/** Reads Event state without consulting or retaining its target. */
export function readDomEventStatus(
  value: unknown,
): DomEventStatusSnapshot | null {
  if (!objectLike(value)) return null;
  const eventBrand = realmBrandGetter("Event", "type");
  if (eventBrand !== undefined && hasNativeBrand(eventBrand, value)) {
    try {
      const type = applyRealmGetter("Event", "type", value);
      const cancelable = applyRealmGetter("Event", "cancelable", value);
      const defaultPrevented = applyRealmGetter(
        "Event",
        "defaultPrevented",
        value,
      );
      return validEventStatus(type, cancelable, defaultPrevented)
        ? Object.freeze({
            source: "native",
            type,
            cancelable: cancelable as boolean,
            defaultPrevented: defaultPrevented as boolean,
          })
        : null;
    } catch {
      return null;
    }
  }
  try {
    const type = Reflect.get(value, "type", value) as unknown;
    const cancelable = Reflect.get(value, "cancelable", value) as unknown;
    const defaultPrevented = Reflect.get(
      value,
      "defaultPrevented",
      value,
    ) as unknown;
    return validEventStatus(type, cancelable, defaultPrevented)
      ? Object.freeze({
          source: "structural",
          type,
          cancelable: cancelable as boolean,
          defaultPrevented: defaultPrevented as boolean,
        })
      : null;
  } catch {
    return null;
  }
}

/** Reads genuine InputEvent fields through brand-checked platform getters. */
export function readDomInputEvent(value: unknown): DomInputEventFields | null {
  if (!objectLike(value)) return null;
  const brand = realmBrandGetter("InputEvent", "inputType");
  if (brand !== undefined && hasNativeBrand(brand, value)) {
    try {
      const inputType = applyRealmGetter("InputEvent", "inputType", value);
      const data = applyRealmGetter("InputEvent", "data", value);
      const isComposing = applyRealmGetter(
        "InputEvent",
        "isComposing",
        value,
      );
      return typeof inputType === "string" &&
          (typeof data === "string" || data === null) &&
          typeof isComposing === "boolean"
        ? Object.freeze({
            source: "native",
            inputType,
            data,
            isComposing,
          })
        : null;
    } catch {
      return null;
    }
  }
  if (isNativeEvent(value)) return null;
  try {
    const inputType = Reflect.get(value, "inputType", value) as unknown;
    const data = Reflect.get(value, "data", value) as unknown;
    const isComposing = Reflect.get(value, "isComposing", value) as unknown;
    return typeof inputType === "string" &&
        (typeof data === "string" || data === null) &&
        typeof isComposing === "boolean"
      ? Object.freeze({
          source: "structural",
          inputType,
          data,
          isComposing,
        })
      : null;
  } catch {
    return null;
  }
}

/** Reads genuine KeyboardEvent fields and AltGraph state natively. */
export function readDomKeyboardEvent(
  value: unknown,
): DomKeyboardEventFields | null {
  if (!objectLike(value)) return null;
  const brand = realmBrandGetter("KeyboardEvent", "key");
  if (brand !== undefined && hasNativeBrand(brand, value)) {
    try {
      const key = applyRealmGetter("KeyboardEvent", "key", value);
      const code = applyRealmGetter("KeyboardEvent", "code", value);
      const altKey = applyRealmGetter("KeyboardEvent", "altKey", value);
      const ctrlKey = applyRealmGetter("KeyboardEvent", "ctrlKey", value);
      const metaKey = applyRealmGetter("KeyboardEvent", "metaKey", value);
      const shiftKey = applyRealmGetter("KeyboardEvent", "shiftKey", value);
      const repeat = applyRealmGetter("KeyboardEvent", "repeat", value);
      const isComposing = applyRealmGetter(
        "KeyboardEvent",
        "isComposing",
        value,
      );
      const keyCode = applyRealmGetter("KeyboardEvent", "keyCode", value);
      const modifierReader = realmBrandMethod(
        "KeyboardEvent",
        "getModifierState",
      );
      if (modifierReader === undefined) return null;
      const altGraph = Reflect.apply(modifierReader, value, ["AltGraph"]);
      return validKeyboardFields(
        key,
        code,
        altKey,
        ctrlKey,
        metaKey,
        shiftKey,
        repeat,
        isComposing,
        keyCode,
        altGraph,
      )
        ? Object.freeze({
            source: "native",
            key,
            code: code as string,
            altKey: altKey as boolean,
            ctrlKey: ctrlKey as boolean,
            metaKey: metaKey as boolean,
            shiftKey: shiftKey as boolean,
            repeat: repeat as boolean,
            isComposing: isComposing as boolean,
            keyCode: keyCode as number,
            altGraph: altGraph as boolean,
          })
        : null;
    } catch {
      return null;
    }
  }
  if (isNativeEvent(value)) return null;
  try {
    const key = Reflect.get(value, "key", value) as unknown;
    const code = Reflect.get(value, "code", value) as unknown;
    const altKey = Reflect.get(value, "altKey", value) as unknown;
    const ctrlKey = Reflect.get(value, "ctrlKey", value) as unknown;
    const metaKey = Reflect.get(value, "metaKey", value) as unknown;
    const shiftKey = Reflect.get(value, "shiftKey", value) as unknown;
    const repeat = Reflect.get(value, "repeat", value) as unknown;
    const isComposing = Reflect.get(value, "isComposing", value) as unknown;
    const keyCode = Reflect.get(value, "keyCode", value) as unknown;
    const modifierReader = Reflect.get(value, "getModifierState", value) as unknown;
    if (typeof modifierReader !== "function") return null;
    const altGraph = Reflect.apply(modifierReader, value, ["AltGraph"]);
    return validKeyboardFields(
      key,
      code,
      altKey,
      ctrlKey,
      metaKey,
      shiftKey,
      repeat,
      isComposing,
      keyCode,
      altGraph,
    )
      ? Object.freeze({
          source: "structural",
          key,
          code: code as string,
          altKey: altKey as boolean,
          ctrlKey: ctrlKey as boolean,
          metaKey: metaKey as boolean,
          shiftKey: shiftKey as boolean,
          repeat: repeat as boolean,
          isComposing: isComposing as boolean,
          keyCode: keyCode as number,
          altGraph: altGraph as boolean,
        })
      : null;
  } catch {
    return null;
  }
}

/** Reads InputEvent.getTargetRanges without retaining a forged method. */
export function readDomInputTargetRanges(value: unknown): DomEventValueRead {
  if (!objectLike(value)) return Object.freeze({ ok: false });
  const brand = realmBrandGetter("InputEvent", "inputType");
  if (brand !== undefined && hasNativeBrand(brand, value)) {
    try {
      const reader = realmBrandMethod("InputEvent", "getTargetRanges");
      return reader === undefined
        ? Object.freeze({ ok: false })
        : Object.freeze({
            ok: true,
            value: Reflect.apply(reader, value, []),
          });
    } catch {
      return Object.freeze({ ok: false });
    }
  }
  if (isNativeEvent(value)) return Object.freeze({ ok: false });
  try {
    const reader = Reflect.get(value, "getTargetRanges", value) as unknown;
    return typeof reader === "function"
      ? Object.freeze({
          ok: true,
          value: Reflect.apply(reader, value, []),
        })
      : Object.freeze({ ok: false });
  } catch {
    return Object.freeze({ ok: false });
  }
}

/** Reads CompositionEvent.data without reading Event.target. */
export function readDomCompositionEventData(
  value: unknown,
): Readonly<{ source: DomEventSource; data: unknown }> | null {
  return readInterfaceValue(value, "CompositionEvent", "data", "data");
}

/** Reads CompositionEvent base and data through their native interfaces. */
export function readDomCompositionEvent(
  value: unknown,
): DomCompositionEventSnapshot | null {
  const base = readDomEventBase(value);
  const data = readDomCompositionEventData(value);
  return base === null || data === null || base.source !== data.source
    ? null
    : Object.freeze({ base, data: data.data });
}

/** Reads ClipboardEvent.clipboardData without reading Event.target. */
export function readDomClipboardData(
  value: unknown,
): Readonly<{ source: DomEventSource; clipboardData: unknown }> | null {
  const read = readInterfaceValue(
    value,
    "ClipboardEvent",
    "clipboardData",
    "clipboardData",
  );
  return read === null
    ? null
    : Object.freeze({ source: read.source, clipboardData: read.data });
}

/** Reads ClipboardEvent base and clipboardData through native interfaces. */
export function readDomClipboardEvent(
  value: unknown,
): DomClipboardEventSnapshot | null {
  const base = readDomEventBase(value);
  const clipboard = readDomClipboardData(value);
  return base === null || clipboard === null || base.source !== clipboard.source
    ? null
    : Object.freeze({ base, clipboardData: clipboard.clipboardData });
}

/** Reads MouseEvent.button without allowing a generic Event to imitate it. */
export function readDomMouseEvent(value: unknown): DomMouseEventSnapshot | null {
  const base = readDomEventBase(value);
  const button = readInterfaceValue(value, "MouseEvent", "button", "button");
  return base === null ||
      button === null ||
      base.source !== button.source ||
      typeof button.data !== "number" ||
      !Number.isSafeInteger(button.data)
    ? null
    : Object.freeze({ base, button: button.data });
}

/** Reads DataTransfer.types below own and host-local prototype shadows. */
export function readDomDataTransferTypes(
  value: unknown,
): DomDataTransferValueRead {
  if (!objectLike(value)) return Object.freeze({ ok: false });
  const brand = realmBrandGetter("DataTransfer", "types");
  if (brand !== undefined && hasNativeBrand(brand, value)) {
    try {
      return Object.freeze({
        ok: true,
        source: "native",
        value: Reflect.apply(brand, value, []),
      });
    } catch {
      return Object.freeze({ ok: false });
    }
  }
  try {
    return Object.freeze({
      ok: true,
      source: "structural",
      value: Reflect.get(value, "types", value) as unknown,
    });
  } catch {
    return Object.freeze({ ok: false });
  }
}

/** Calls DataTransfer.getData through the platform method when branded. */
export function readDomDataTransferData(
  value: unknown,
  format: string,
): DomDataTransferValueRead {
  return invokeDataTransferRead(value, "getData", [format]);
}

/** Calls DataTransfer.clearData through the platform method when branded. */
export function clearDomDataTransferData(
  value: unknown,
  format?: string,
): DomDataTransferMutation {
  return invokeDataTransferMutation(
    value,
    "clearData",
    format === undefined ? [] : [format],
  );
}

/** Calls DataTransfer.setData through the platform method when branded. */
export function setDomDataTransferData(
  value: unknown,
  format: string,
  data: string,
): DomDataTransferMutation {
  return invokeDataTransferMutation(value, "setData", [format, data]);
}

/** Cancels through Event.prototype and confirms through its native getter. */
export function preventDomEventDefault(value: unknown): DomEventCancellation {
  if (!objectLike(value)) {
    return Object.freeze({ ok: false, defaultPrevented: false });
  }
  const eventBrand = realmBrandGetter("Event", "type");
  if (eventBrand !== undefined && hasNativeBrand(eventBrand, value)) {
    let prevented = false;
    try {
      const preventDefault = realmBrandMethod("Event", "preventDefault");
      if (preventDefault === undefined) {
        throw new TypeError("native event cancellation is unavailable");
      }
      Reflect.apply(preventDefault, value, []);
      prevented =
        applyRealmGetter("Event", "defaultPrevented", value) === true;
      return prevented
        ? Object.freeze({ ok: true, defaultPrevented: true })
        : Object.freeze({ ok: false, defaultPrevented: false });
    } catch {
      return Object.freeze({ ok: false, defaultPrevented: prevented });
    }
  }
  try {
    if (Reflect.get(value, "defaultPrevented", value) === true) {
      return Object.freeze({ ok: true, defaultPrevented: true });
    }
    const preventDefault = Reflect.get(value, "preventDefault", value) as unknown;
    if (typeof preventDefault !== "function") {
      return Object.freeze({ ok: false, defaultPrevented: false });
    }
    Reflect.apply(preventDefault, value, []);
    return Reflect.get(value, "defaultPrevented", value) === true
      ? Object.freeze({ ok: true, defaultPrevented: true })
      : Object.freeze({ ok: false, defaultPrevented: false });
  } catch {
    return Object.freeze({ ok: false, defaultPrevented: false });
  }
}

function readInterfaceValue(
  value: unknown,
  constructorName: string,
  brandProperty: string,
  property: string,
): Readonly<{ source: DomEventSource; data: unknown }> | null {
  if (!objectLike(value)) return null;
  const brand = realmBrandGetter(constructorName, brandProperty);
  if (brand !== undefined && hasNativeBrand(brand, value)) {
    try {
      return Object.freeze({
        source: "native",
        data: applyRealmGetter(constructorName, property, value),
      });
    } catch {
      return null;
    }
  }
  if (isNativeEvent(value)) return null;
  try {
    return Object.freeze({
      source: "structural",
      data: Reflect.get(value, property, value) as unknown,
    });
  } catch {
    return null;
  }
}

function invokeDataTransferRead(
  value: unknown,
  methodName: string,
  args: readonly unknown[],
): DomDataTransferValueRead {
  if (!objectLike(value)) return Object.freeze({ ok: false });
  const brand = realmBrandGetter("DataTransfer", "types");
  const native = brand !== undefined && hasNativeBrand(brand, value);
  try {
    const method = native
      ? realmBrandMethod("DataTransfer", methodName)
      : Reflect.get(value, methodName, value) as unknown;
    if (typeof method !== "function") return Object.freeze({ ok: false });
    return Object.freeze({
      ok: true,
      source: native ? "native" : "structural",
      value: Reflect.apply(method, value, args),
    });
  } catch {
    return Object.freeze({ ok: false });
  }
}

function invokeDataTransferMutation(
  value: unknown,
  methodName: string,
  args: readonly unknown[],
): DomDataTransferMutation {
  const read = invokeDataTransferRead(value, methodName, args);
  return read.ok
    ? Object.freeze({ ok: true, source: read.source })
    : Object.freeze({ ok: false });
}

function isNativeEvent(value: object): boolean {
  const brand = realmBrandGetter("Event", "type");
  return brand !== undefined && hasNativeBrand(brand, value);
}

function realmBrandGetter(
  constructorName: string,
  property: string,
): NativeGetter | undefined {
  try {
    const constructor = Reflect.get(
      globalThis,
      constructorName,
      globalThis,
    ) as unknown;
    if (typeof constructor !== "function") return undefined;
    const prototype = Reflect.get(
      constructor,
      "prototype",
      constructor,
    ) as unknown;
    if (typeof prototype !== "object" || prototype === null) return undefined;
    const chain = prototypeChainFrom(prototype);
    return chain === null ? undefined : deepestGetter(chain, property);
  } catch {
    return undefined;
  }
}

function realmBrandMethod(
  constructorName: string,
  property: string,
): NativeMethod | undefined {
  try {
    const constructor = Reflect.get(
      globalThis,
      constructorName,
      globalThis,
    ) as unknown;
    if (typeof constructor !== "function") return undefined;
    const prototype = Reflect.get(
      constructor,
      "prototype",
      constructor,
    ) as unknown;
    if (typeof prototype !== "object" || prototype === null) return undefined;
    const chain = prototypeChainFrom(prototype);
    return chain === null ? undefined : deepestMethod(chain, property);
  } catch {
    return undefined;
  }
}

function hasNativeBrand(getter: NativeGetter, value: object): boolean {
  try {
    Reflect.apply(getter, value, []);
    return true;
  } catch {
    return false;
  }
}

function prototypeChainFrom(start: object | null): readonly object[] | null {
  const prototypes: object[] = [];
  const seen = new Set<object>();
  let candidate = start;
  try {
    while (candidate !== null) {
      if (
        prototypes.length >= MAX_EVENT_PROTOTYPE_DEPTH ||
        seen.has(candidate)
      ) {
        return null;
      }
      seen.add(candidate);
      prototypes.push(candidate);
      candidate = Object.getPrototypeOf(candidate) as object | null;
    }
    return Object.freeze(prototypes);
  } catch {
    return null;
  }
}

function applyRealmGetter(
  constructorName: string,
  property: string,
  receiver: object,
): unknown {
  const found = realmBrandGetter(constructorName, property);
  if (found === undefined) {
    throw new TypeError(`native ${constructorName}.${property} is unavailable`);
  }
  return Reflect.apply(found, receiver, []);
}

function deepestGetter(
  chain: readonly object[],
  name: string,
): NativeGetter | undefined {
  let found: NativeGetter | undefined;
  for (let index = 0; index < chain.length - 1; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(chain[index]!, name);
    if (typeof descriptor?.get === "function") found = descriptor.get;
  }
  return found;
}

function deepestMethod(
  chain: readonly object[],
  name: string,
): NativeMethod | undefined {
  let found: NativeMethod | undefined;
  for (let index = 0; index < chain.length - 1; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(chain[index]!, name);
    if (typeof descriptor?.value === "function") {
      found = descriptor.value as NativeMethod;
    }
  }
  return found;
}

function validEventStatus(
  type: unknown,
  cancelable: unknown,
  defaultPrevented: unknown,
): type is string {
  return (
    typeof type === "string" &&
    typeof cancelable === "boolean" &&
    typeof defaultPrevented === "boolean"
  );
}

function validKeyboardFields(
  key: unknown,
  code: unknown,
  altKey: unknown,
  ctrlKey: unknown,
  metaKey: unknown,
  shiftKey: unknown,
  repeat: unknown,
  isComposing: unknown,
  keyCode: unknown,
  altGraph: unknown,
): key is string {
  return (
    typeof key === "string" &&
    typeof code === "string" &&
    typeof altKey === "boolean" &&
    typeof ctrlKey === "boolean" &&
    typeof metaKey === "boolean" &&
    typeof shiftKey === "boolean" &&
    typeof repeat === "boolean" &&
    typeof isComposing === "boolean" &&
    Number.isSafeInteger(keyCode) &&
    typeof altGraph === "boolean"
  );
}

function objectLike(value: unknown): value is object {
  return (
    (typeof value === "object" && value !== null) || typeof value === "function"
  );
}
