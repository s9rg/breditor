import type { CompositionResult } from "./composition_result.js";
import { compositionFailure, compositionSuccess } from "./composition_result.js";
import {
  readDomCompositionEventData,
  readDomEventStatus,
  readDomInputEvent,
} from "./dom_event_intrinsics.js";

/** Maximum composed-text size measured in DOM-compatible UTF-16 code units. */
export const MAX_COMPOSITION_TEXT_UTF16 = 65_536;

/** Maximum composed-text size measured in canonical UTF-8 bytes. */
export const MAX_COMPOSITION_TEXT_UTF8 = 65_536;

/** Defensive limit for an unrecognized native `inputType` string. */
export const MAX_COMPOSITION_INPUT_TYPE_UTF16 = 128;

/** Native CompositionEvent types observed by the composition state machine. */
export type NativeCompositionEventType =
  | "compositionstart"
  | "compositionupdate"
  | "compositionend";

/** Input types which can participate in browser composition lifecycles. */
export type CompositionInputType =
  | "insertCompositionText"
  | "deleteCompositionText"
  | "insertFromComposition"
  | "deleteByComposition";

/** Evidence origin retained after the native event itself is released. */
export type CompositionEvidenceSource =
  | "compositionupdate"
  | "compositionend"
  | "beforeinput"
  | "input";

/** Provisional evidence may evolve; final evidence can settle a composition. */
export type CompositionEvidenceGrade = "provisional" | "final";

/** Primitive-only snapshot of a native CompositionEvent. */
export interface NativeCompositionEventSnapshot {
  readonly kind: "compositionEvent";
  readonly type: NativeCompositionEventType;
  readonly data: string;
  readonly cancelable: boolean;
  readonly defaultPrevented: boolean;
}

/** Primitive-only snapshot of a native beforeinput/input event. */
export interface NativeCompositionInputSnapshot {
  readonly kind: "inputEvent";
  readonly type: "beforeinput" | "input";
  readonly inputType: string;
  readonly data: string | null;
  readonly isComposing: boolean;
  readonly cancelable: boolean;
  readonly defaultPrevented: boolean;
}

export type NativeCompositionSnapshot =
  | NativeCompositionEventSnapshot
  | NativeCompositionInputSnapshot;

/** One bounded text observation, detached from Event and DOM objects. */
export interface CompositionEvidence {
  readonly source: CompositionEvidenceSource;
  readonly grade: CompositionEvidenceGrade;
  readonly text: string | null;
  readonly inputType: CompositionInputType | null;
}

/** Why bounded Unicode measurement rejected a value. */
export type UnicodeTextMeasureFailure =
  | "invalidType"
  | "invalidLimit"
  | "invalidUnicode"
  | "resourceLimit";

/** Result of allocation-free Unicode scalar and UTF-8 measurement. */
export type BoundedUnicodeTextMeasure =
  | Readonly<{ ok: true; utf16Length: number; utf8Length: number }>
  | Readonly<{ ok: false; reason: UnicodeTextMeasureFailure }>;

const OWNED_SNAPSHOTS = new WeakSet<object>();

/**
 * Snapshots a native CompositionEvent without retaining its target or invoking
 * any property more than once. Hostile accessors and proxies become failures.
 */
export function snapshotNativeCompositionEvent(
  event: unknown,
): CompositionResult<NativeCompositionEventSnapshot> {
  try {
    const status = readDomEventStatus(event);
    const composition = readDomCompositionEventData(event);
    if (
      status === null ||
      composition === null ||
      status.source !== composition.source
    ) {
      return compositionFailure("composition.invalid_event");
    }
    const { type, cancelable, defaultPrevented } = status;
    const { data } = composition;
    if (
      !isNativeCompositionEventType(type) ||
      typeof data !== "string" ||
      typeof cancelable !== "boolean" ||
      typeof defaultPrevented !== "boolean"
    ) {
      return compositionFailure("composition.invalid_event");
    }
    if (!compositionTextIsAdmissible(data)) {
      return compositionFailure("composition.invalid_text");
    }
    const snapshot: NativeCompositionEventSnapshot = Object.freeze({
      kind: "compositionEvent",
      type,
      data,
      cancelable,
      defaultPrevented,
    });
    OWNED_SNAPSHOTS.add(snapshot);
    return compositionSuccess(snapshot);
  } catch {
    return compositionFailure("composition.invalid_event");
  }
}

/**
 * Snapshots native beforeinput/input composition fields once. Target ranges,
 * DOM nodes, DataTransfer, and the Event object never cross this boundary.
 */
export function snapshotNativeCompositionInput(
  event: unknown,
): CompositionResult<NativeCompositionInputSnapshot> {
  try {
    const base = readDomEventStatus(event);
    const input = readDomInputEvent(event);
    if (base === null || input === null || base.source !== input.source) {
      return compositionFailure("composition.invalid_event");
    }
    const { type, cancelable, defaultPrevented } = base;
    const { inputType, data, isComposing } = input;
    if (
      (type !== "beforeinput" && type !== "input") ||
      typeof inputType !== "string" ||
      inputType.length > MAX_COMPOSITION_INPUT_TYPE_UTF16 ||
      (data !== null && typeof data !== "string") ||
      typeof isComposing !== "boolean" ||
      typeof cancelable !== "boolean" ||
      typeof defaultPrevented !== "boolean"
    ) {
      return compositionFailure("composition.invalid_event");
    }
    if (typeof data === "string" && !compositionTextIsAdmissible(data)) {
      return compositionFailure("composition.invalid_text");
    }
    const snapshot: NativeCompositionInputSnapshot = Object.freeze({
      kind: "inputEvent",
      type,
      inputType,
      data,
      isComposing,
      cancelable,
      defaultPrevented,
    });
    OWNED_SNAPSHOTS.add(snapshot);
    return compositionSuccess(snapshot);
  } catch {
    return compositionFailure("composition.invalid_event");
  }
}

/** Returns a composition input type, including legacy aliases, or `null`. */
export function compositionInputType(value: unknown): CompositionInputType | null {
  switch (value) {
    case "insertCompositionText":
    case "deleteCompositionText":
    case "insertFromComposition":
    case "deleteByComposition":
      return value;
    default:
      return null;
  }
}

/**
 * Classifies an owned snapshot without assuming one disputed specification
 * event order. Empty final text is preserved as explicit cancellation evidence.
 */
export function classifyCompositionEvidence(
  snapshot: NativeCompositionSnapshot,
): CompositionEvidence | null {
  if (!isOwnedSnapshot(snapshot)) {
    return null;
  }
  if (snapshot.kind === "compositionEvent") {
    if (snapshot.type === "compositionstart") {
      return null;
    }
    return Object.freeze({
      source: snapshot.type,
      grade: snapshot.type === "compositionend" ? "final" : "provisional",
      text: snapshot.data,
      inputType: null,
    });
  }

  const inputType = compositionInputType(snapshot.inputType);
  if (inputType === null) {
    return null;
  }
  const final =
    inputType === "insertFromComposition" ||
    (snapshot.type === "input" &&
      inputType === "insertCompositionText" &&
      !snapshot.isComposing);
  return Object.freeze({
    source: snapshot.type,
    grade: final ? "final" : "provisional",
    text: snapshot.data,
    inputType,
  });
}

/** Empty is valid because it is the browser's cancellation/deletion result. */
export function compositionTextIsAdmissible(value: unknown): value is string {
  return measureBoundedUnicodeText(
    value,
    MAX_COMPOSITION_TEXT_UTF16,
    MAX_COMPOSITION_TEXT_UTF8,
  ).ok;
}

/**
 * Validates Unicode scalar form while measuring UTF-8 without allocating an
 * encoded copy. Length limits are checked during the same bounded pass.
 */
export function measureBoundedUnicodeText(
  value: unknown,
  maxUtf16: number,
  maxUtf8: number,
): BoundedUnicodeTextMeasure {
  if (typeof value !== "string") {
    return Object.freeze({ ok: false, reason: "invalidType" });
  }
  if (
    !Number.isSafeInteger(maxUtf16) ||
    maxUtf16 < 0 ||
    !Number.isSafeInteger(maxUtf8) ||
    maxUtf8 < 0
  ) {
    return Object.freeze({ ok: false, reason: "invalidLimit" });
  }
  if (value.length > maxUtf16) {
    return Object.freeze({ ok: false, reason: "resourceLimit" });
  }

  let utf8Length = 0;
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit <= 0x7f) {
      utf8Length += 1;
    } else if (codeUnit <= 0x7ff) {
      utf8Length += 2;
    } else if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const low = value.charCodeAt(index + 1);
      if (!(low >= 0xdc00 && low <= 0xdfff)) {
        return Object.freeze({ ok: false, reason: "invalidUnicode" });
      }
      utf8Length += 4;
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return Object.freeze({ ok: false, reason: "invalidUnicode" });
    } else {
      utf8Length += 3;
    }
    if (utf8Length > maxUtf8) {
      return Object.freeze({ ok: false, reason: "resourceLimit" });
    }
  }
  return Object.freeze({ ok: true, utf16Length: value.length, utf8Length });
}

function isNativeCompositionEventType(value: unknown): value is NativeCompositionEventType {
  return (
    value === "compositionstart" ||
    value === "compositionupdate" ||
    value === "compositionend"
  );
}

function isOwnedSnapshot(value: unknown): value is NativeCompositionSnapshot {
  return (
    typeof value === "object" &&
    value !== null &&
    OWNED_SNAPSHOTS.has(value as object)
  );
}
