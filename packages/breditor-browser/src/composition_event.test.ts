import { describe, expect, it } from "vitest";

import {
  MAX_COMPOSITION_INPUT_TYPE_UTF16,
  MAX_COMPOSITION_TEXT_UTF16,
  classifyCompositionEvidence,
  compositionInputType,
  compositionTextIsAdmissible,
  measureBoundedUnicodeText,
  snapshotNativeCompositionEvent,
  snapshotNativeCompositionInput,
  type NativeCompositionEventSnapshot,
  type NativeCompositionInputSnapshot,
} from "./composition_event.js";
import type { CompositionResult } from "./composition_result.js";

function valueOf<T>(result: CompositionResult<T>): T {
  if (!result.ok) {
    throw new Error(`${result.error.code}: ${result.error.message}`);
  }
  return result.value;
}

function composition(
  type: "compositionstart" | "compositionupdate" | "compositionend",
  data: string,
): NativeCompositionEventSnapshot {
  return valueOf(
    snapshotNativeCompositionEvent({
      type,
      data,
      cancelable: false,
      defaultPrevented: false,
    }),
  );
}

function input(
  type: "beforeinput" | "input",
  inputType: string,
  data: string | null,
  isComposing: boolean,
): NativeCompositionInputSnapshot {
  return valueOf(
    snapshotNativeCompositionInput({
      type,
      inputType,
      data,
      isComposing,
      cancelable: type === "beforeinput",
      defaultPrevented: false,
    }),
  );
}

describe("composition event snapshots", () => {
  it("accepts empty and exact bounded Unicode while rejecting invalid scalars", () => {
    expect(compositionTextIsAdmissible("")).toBe(true);
    expect(compositionTextIsAdmissible("x".repeat(MAX_COMPOSITION_TEXT_UTF16))).toBe(true);
    expect(compositionTextIsAdmissible("x".repeat(MAX_COMPOSITION_TEXT_UTF16 + 1))).toBe(false);
    expect(compositionTextIsAdmissible("é".repeat(32_768))).toBe(true);
    expect(compositionTextIsAdmissible("é".repeat(32_769))).toBe(false);
    expect(compositionTextIsAdmissible("😀")).toBe(true);
    expect(compositionTextIsAdmissible("\ud800")).toBe(false);
    expect(compositionTextIsAdmissible("\udc00")).toBe(false);
    expect(compositionTextIsAdmissible(null)).toBe(false);
  });

  it("measures without allocating an encoded copy and distinguishes failures", () => {
    expect(measureBoundedUnicodeText("aé😀", 4, 7)).toEqual({
      ok: true,
      utf16Length: 4,
      utf8Length: 7,
    });
    expect(measureBoundedUnicodeText("abc", 2, 10)).toEqual({
      ok: false,
      reason: "resourceLimit",
    });
    expect(measureBoundedUnicodeText("\ud800", 10, 10)).toEqual({
      ok: false,
      reason: "invalidUnicode",
    });
    expect(measureBoundedUnicodeText("x", -1, 10)).toEqual({
      ok: false,
      reason: "invalidLimit",
    });
  });

  it("snapshots each native field once and retains no Event target", () => {
    const reads = new Map<string, number>();
    const event = Object.create(null) as Record<string, unknown>;
    const fields: Readonly<Record<string, unknown>> = {
      type: "compositionupdate",
      data: "文",
      cancelable: false,
      defaultPrevented: false,
    };
    for (const [key, value] of Object.entries(fields)) {
      Object.defineProperty(event, key, {
        get() {
          reads.set(key, (reads.get(key) ?? 0) + 1);
          return value;
        },
      });
    }
    Object.defineProperty(event, "target", {
      get() {
        throw new Error("target must not be retained or read");
      },
    });

    const snapshot = valueOf(snapshotNativeCompositionEvent(event));

    expect(Object.fromEntries(reads)).toEqual({
      type: 1,
      data: 1,
      cancelable: 1,
      defaultPrevented: 1,
    });
    expect("target" in snapshot).toBe(false);
    expect(Object.isFrozen(snapshot)).toBe(true);
  });

  it("turns throwing accessors, proxies, and oversized fields into redacted failures", () => {
    const accessor = {
      type: "compositionend",
      get data(): string {
        throw new Error("hostile getter");
      },
      cancelable: false,
      defaultPrevented: false,
    };
    expect(snapshotNativeCompositionEvent(accessor)).toMatchObject({
      ok: false,
      error: { code: "composition.invalid_event" },
    });

    const proxy = new Proxy({}, {
      get() {
        throw new Error("hostile proxy");
      },
    });
    expect(() => snapshotNativeCompositionInput(proxy)).not.toThrow();
    expect(snapshotNativeCompositionInput(proxy)).toMatchObject({
      ok: false,
      error: { code: "composition.invalid_event" },
    });

    expect(
      snapshotNativeCompositionInput({
        type: "input",
        inputType: "x".repeat(MAX_COMPOSITION_INPUT_TYPE_UTF16 + 1),
        data: null,
        isComposing: false,
        cancelable: false,
        defaultPrevented: false,
      }),
    ).toMatchObject({ ok: false, error: { code: "composition.invalid_event" } });
    expect(
      snapshotNativeCompositionEvent({
        type: "compositionupdate",
        data: "\ud800",
        cancelable: false,
        defaultPrevented: false,
      }),
    ).toMatchObject({ ok: false, error: { code: "composition.invalid_text" } });
  });

  it("recognizes modern composition input and retained legacy aliases", () => {
    expect(compositionInputType("insertCompositionText")).toBe("insertCompositionText");
    expect(compositionInputType("deleteCompositionText")).toBe("deleteCompositionText");
    expect(compositionInputType("insertFromComposition")).toBe("insertFromComposition");
    expect(compositionInputType("deleteByComposition")).toBe("deleteByComposition");
    expect(compositionInputType("insertText")).toBeNull();
  });

  it("classifies evidence without relying on one browser event order", () => {
    expect(classifyCompositionEvidence(composition("compositionstart", ""))).toBeNull();
    expect(classifyCompositionEvidence(composition("compositionupdate", "かな"))).toEqual({
      source: "compositionupdate",
      grade: "provisional",
      text: "かな",
      inputType: null,
    });
    expect(classifyCompositionEvidence(composition("compositionend", "仮名"))).toEqual({
      source: "compositionend",
      grade: "final",
      text: "仮名",
      inputType: null,
    });
    expect(
      classifyCompositionEvidence(input("beforeinput", "insertCompositionText", "か", true)),
    ).toMatchObject({ grade: "provisional", text: "か" });
    expect(
      classifyCompositionEvidence(input("input", "insertCompositionText", "か", true)),
    ).toMatchObject({ grade: "provisional", text: "か" });
    expect(
      classifyCompositionEvidence(input("input", "insertCompositionText", "仮", false)),
    ).toMatchObject({ grade: "final", text: "仮" });
    expect(
      classifyCompositionEvidence(input("beforeinput", "insertFromComposition", "仮", false)),
    ).toMatchObject({ grade: "final", text: "仮" });
    expect(
      classifyCompositionEvidence(input("input", "deleteCompositionText", null, false)),
    ).toMatchObject({ grade: "provisional", text: null });
    expect(classifyCompositionEvidence(input("input", "insertText", "x", false))).toBeNull();
  });

  it("will not classify caller-forged snapshot records", () => {
    expect(
      classifyCompositionEvidence({
        kind: "compositionEvent",
        type: "compositionend",
        data: "forged",
        cancelable: false,
        defaultPrevented: false,
      }),
    ).toBeNull();
  });
});
