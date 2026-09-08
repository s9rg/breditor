import { describe, expect, it } from "vitest";

import {
  BASE_TOOLBAR_STATE_IDS,
  DEFAULT_TOOLBAR_MANIFEST,
  MAX_TOOLBAR_CONTROLS,
  MAX_TOOLBAR_GROUP_UTF16,
  MAX_TOOLBAR_LABEL_UTF16,
  createToolbarManifest,
  isOwnedToolbarManifest,
} from "./toolbar_manifest.js";

describe("toolbar manifest", () => {
  it("defines the frozen Bold, Undo, and Redo base presentation", () => {
    expect(DEFAULT_TOOLBAR_MANIFEST).toEqual({
      label: "Editor controls",
      controls: [
        {
          kind: "button",
          stateId: BASE_TOOLBAR_STATE_IDS.bold,
          label: "Bold",
          activation: "tracked",
          command: {
            kind: "intent",
            intentId: "breditor/format-strong",
          },
        },
        {
          kind: "button",
          stateId: BASE_TOOLBAR_STATE_IDS.undo,
          label: "Undo",
          activation: "stateless",
          command: { kind: "history", operation: "undo" },
        },
        {
          kind: "button",
          stateId: BASE_TOOLBAR_STATE_IDS.redo,
          label: "Redo",
          activation: "stateless",
          command: { kind: "history", operation: "redo" },
        },
      ],
    });
    expect(isOwnedToolbarManifest(DEFAULT_TOOLBAR_MANIFEST)).toBe(true);
    expect(Object.isFrozen(DEFAULT_TOOLBAR_MANIFEST)).toBe(true);
    expect(Object.isFrozen(DEFAULT_TOOLBAR_MANIFEST.controls)).toBe(true);
    for (const control of DEFAULT_TOOLBAR_MANIFEST.controls) {
      expect(Object.isFrozen(control)).toBe(true);
      expect(Object.isFrozen(control.command)).toBe(true);
      if (control.command.kind === "action") {
        expect(Object.isFrozen(control.command.input)).toBe(true);
      }
    }
  });

  it("copies only its closed callback-free schema", () => {
    const source = {
      label: "Insertions",
      onRefresh: () => {
        throw new Error("must not be retained");
      },
      controls: [
        {
          kind: "button",
          stateId: "example/control-snippet",
          label: "Snippet",
          activation: "stateless",
          group: "insertions",
          // This is deliberately outside the v0.0.56 schema: advertising a
          // shortcut without registering its behavior would be misleading.
          ariaKeyShortcuts: "Control+Shift+1",
          onClick: () => {
            throw new Error("must not be retained");
          },
          command: {
            kind: "action",
            actionId: "example/insert-snippet",
            input: { kind: "string", value: "hello", callback: () => undefined },
            history: "closeBefore",
            execute: () => undefined,
          },
        },
      ],
    };
    let undeclaredReads = 0;
    Object.defineProperty(source, "extensionFactory", {
      enumerable: true,
      get: () => {
        undeclaredReads += 1;
        throw new Error("undeclared accessors must not execute");
      },
    });
    Object.defineProperty(source.controls[0]!, "renderIcon", {
      enumerable: true,
      get: () => {
        undeclaredReads += 1;
        throw new Error("undeclared accessors must not execute");
      },
    });

    const manifest = createToolbarManifest(source);
    source.controls[0]!.label = "Changed";
    source.controls[0]!.command.input.value = "changed";

    expect(manifest).toEqual({
      label: "Insertions",
      controls: [
        {
          kind: "button",
          stateId: "example/control-snippet",
          label: "Snippet",
          activation: "stateless",
          group: "insertions",
          command: {
            kind: "action",
            actionId: "example/insert-snippet",
            input: { kind: "string", value: "hello" },
            history: "closeBefore",
          },
        },
      ],
    });
    expect("onRefresh" in manifest).toBe(false);
    expect("onClick" in manifest.controls[0]!).toBe(false);
    expect("ariaKeyShortcuts" in manifest.controls[0]!).toBe(false);
    const command = manifest.controls[0]!.command;
    expect(command.kind).toBe("action");
    expect("execute" in command).toBe(false);
    expect(command.kind === "action" && "callback" in command.input).toBe(false);
    expect(undeclaredReads).toBe(0);
  });

  it("copies intent references without admitting policy or executable fields", () => {
    const source = {
      label: "Formats",
      controls: [
        {
          kind: "button",
          stateId: "example/control-highlight",
          label: "Highlight",
          activation: "tracked",
          command: {
            kind: "intent",
            intentId: "example/format-highlight",
            history: "preserve",
            input: { kind: "none" },
            execute: () => undefined,
          },
        },
      ],
    };

    const manifest = createToolbarManifest(source);
    source.controls[0]!.command.intentId = "example/changed";

    expect(manifest.controls[0]?.command).toEqual({
      kind: "intent",
      intentId: "example/format-highlight",
    });
    expect(Object.isFrozen(manifest.controls[0]?.command)).toBe(true);
    expect("history" in manifest.controls[0]!.command).toBe(false);
    expect("input" in manifest.controls[0]!.command).toBe(false);
    expect("execute" in manifest.controls[0]!.command).toBe(false);
  });

  it("rejects retained-field accessors without executing them", () => {
    let reads = 0;
    const accessor = (value: unknown): PropertyDescriptor => ({
      configurable: true,
      enumerable: true,
      get: () => {
        reads += 1;
        return value;
      },
    });
    const valid = historyControl("example/control-history", "History", "undo");

    const manifest = { controls: [valid] };
    Object.defineProperty(manifest, "label", accessor("Tools"));

    const control = {
      kind: "button",
      stateId: "example/control-history",
      activation: "stateless",
      command: { kind: "history", operation: "undo" },
    };
    Object.defineProperty(control, "label", accessor("History"));

    const historyCommand = { kind: "history" };
    Object.defineProperty(historyCommand, "operation", accessor("undo"));

    const intentCommand = { kind: "intent" };
    Object.defineProperty(
      intentCommand,
      "intentId",
      accessor("example/format-highlight"),
    );

    const actionInput = { kind: "string" };
    Object.defineProperty(actionInput, "value", accessor("text"));

    const optionalGroup = historyControl(
      "example/control-group",
      "Group",
      "undo",
    ) as Record<string, unknown>;
    Object.defineProperty(optionalGroup, "group", accessor("inline"));

    const cases = [
      manifest,
      { label: "Tools", controls: [control] },
      {
        label: "Tools",
        controls: [
          {
            kind: "button",
            stateId: "example/control-history",
            label: "History",
            activation: "stateless",
            command: historyCommand,
          },
        ],
      },
      {
        label: "Tools",
        controls: [
          {
            kind: "button",
            stateId: "example/control-intent",
            label: "Intent",
            activation: "tracked",
            command: intentCommand,
          },
        ],
      },
      {
        label: "Tools",
        controls: [
          {
            kind: "button",
            stateId: "example/control-action",
            label: "Action",
            activation: "stateless",
            command: {
              kind: "action",
              actionId: "example/insert",
              input: actionInput,
              history: "preserve",
            },
          },
        ],
      },
      { label: "Tools", controls: [optionalGroup] },
    ];

    for (const value of cases) {
      expect(() => createToolbarManifest(value)).toThrow(/own data property/u);
    }
    expect(reads).toBe(0);
  });

  it("does not execute or retain inherited fields", () => {
    let reads = 0;
    const inheritedManifest = Object.create({
      get label(): string {
        reads += 1;
        return "Tools";
      },
    }) as Record<string, unknown>;
    Object.defineProperty(inheritedManifest, "controls", {
      enumerable: true,
      value: [historyControl("example/control-history", "History", "undo")],
    });
    expect(() => createToolbarManifest(inheritedManifest)).toThrow(
      /own data property/u,
    );

    const inheritedOptional = {
      get group(): string {
        reads += 1;
        return "inherited";
      },
    };
    const control = Object.assign(Object.create(inheritedOptional), {
      kind: "button",
      stateId: "example/control-history",
      label: "History",
      activation: "stateless",
      command: { kind: "history", operation: "undo" },
    });
    const owned = createToolbarManifest({ label: "Tools", controls: [control] });
    expect("group" in owned.controls[0]!).toBe(false);
    expect(reads).toBe(0);
  });

  it("requires a bounded dense array of own data elements", () => {
    const valid = historyControl("example/control-history", "History", "undo");
    expect(() =>
      createToolbarManifest({ label: "Tools", controls: new Array(1) }),
    ).toThrow(/own data property/u);

    let reads = 0;
    const accessorArray = [valid];
    Object.defineProperty(accessorArray, "0", {
      configurable: true,
      enumerable: true,
      get: () => {
        reads += 1;
        return valid;
      },
    });
    expect(() =>
      createToolbarManifest({ label: "Tools", controls: accessorArray }),
    ).toThrow(/own data property/u);
    expect(reads).toBe(0);

    const inheritedElement = new Array(1);
    const inheritedIndex = Object.create(Array.prototype) as Record<string, unknown>;
    Object.defineProperty(inheritedIndex, "0", {
      configurable: true,
      get: () => {
        reads += 1;
        return valid;
      },
    });
    Object.setPrototypeOf(inheritedElement, inheritedIndex);
    expect(() =>
      createToolbarManifest({ label: "Tools", controls: inheritedElement }),
    ).toThrow(/own data property/u);
    expect(reads).toBe(0);

    expect(() =>
      createToolbarManifest({
        label: "Tools",
        controls: { 0: valid, length: 1 },
      }),
    ).toThrow(/must be an array/u);

    let ordinaryReads = 0;
    const noOrdinaryReads = new Proxy([valid], {
      get: () => {
        ordinaryReads += 1;
        throw new Error("ordinary array access is forbidden");
      },
    });
    expect(
      createToolbarManifest({ label: "Tools", controls: noOrdinaryReads }).controls,
    ).toHaveLength(1);
    expect(ordinaryReads).toBe(0);

    const lyingLength = new Proxy([valid], {
      getOwnPropertyDescriptor: (target, key) => {
        const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
        return key === "length" && descriptor !== undefined
          ? { ...descriptor, value: MAX_TOOLBAR_CONTROLS + 1 }
          : descriptor;
      },
    });
    expect(() =>
      createToolbarManifest({ label: "Tools", controls: lyingLength }),
    ).toThrow(RangeError);
  });

  it("rejects duplicate identities and controls outside the fixed bound", () => {
    const control = historyControl("example/control-same", "Same", "undo");
    expect(() =>
      createToolbarManifest({ label: "Tools", controls: [control, control] }),
    ).toThrow(/duplicated/u);
    expect(() => createToolbarManifest({ label: "Tools", controls: [] })).toThrow(
      RangeError,
    );
    expect(() =>
      createToolbarManifest({
        label: "Tools",
        controls: Array.from({ length: MAX_TOOLBAR_CONTROLS + 1 }, (_, index) =>
          historyControl(`example/control-${index}`, `Control ${index}`, "undo"),
        ),
      }),
    ).toThrow(RangeError);
  });

  it("rejects malformed labels, identities, commands, and oversized input", () => {
    const valid = historyControl("example/control-history", "History", "undo");
    const arrayManifest = Object.assign([], {
      label: "Tools",
      controls: [valid],
    });
    expect(() => createToolbarManifest(arrayManifest)).toThrow(TypeError);
    for (const label of ["", "   ", "bad\nlabel", "x".repeat(MAX_TOOLBAR_LABEL_UTF16 + 1)]) {
      expect(() => createToolbarManifest({ label, controls: [valid] })).toThrow(
        TypeError,
      );
    }
    for (const stateId of [
      "missing-slash",
      "Example/control",
      "example/two/slashes",
    ]) {
      expect(() =>
        createToolbarManifest({
          label: "Tools",
          controls: [historyControl(stateId, "History", "undo")],
        }),
      ).toThrow(TypeError);
    }
    expect(() =>
      createToolbarManifest({
        label: "Tools",
        controls: [historyControl("example/control-history", "History", "clear")],
      }),
    ).toThrow(TypeError);
    for (const intentId of [
      "missing-slash",
      "Example/format-highlight",
      "example/two/slashes",
    ]) {
      expect(() =>
        createToolbarManifest({
          label: "Tools",
          controls: [
            {
              kind: "button",
              stateId: "example/control-intent",
              label: "Intent",
              activation: "tracked",
              command: { kind: "intent", intentId },
            },
          ],
        }),
      ).toThrow(TypeError);
    }
    expect(() =>
      createToolbarManifest({
        label: "Tools",
        controls: [
          {
            kind: "button",
            stateId: "example/control-large",
            label: "Large",
            activation: "stateless",
            command: {
              kind: "action",
              actionId: "example/insert",
              input: { kind: "string", value: "x".repeat(65_537) },
              history: "preserve",
            },
          },
        ],
      }),
    ).toThrow(TypeError);
    for (const [field, value] of [
      ["group", "x".repeat(MAX_TOOLBAR_GROUP_UTF16 + 1)],
      ["group", " surrounding "],
    ] as const) {
      expect(() =>
        createToolbarManifest({
          label: "Tools",
          controls: [
            {
              kind: "button",
              stateId: "example/control-option",
              label: "Option",
              activation: "stateless",
              [field]: value,
              command: { kind: "history", operation: "undo" },
            },
          ],
        }),
      ).toThrow(TypeError);
    }
  });

  it("does not accept structurally forged manifests as owned", () => {
    expect(
      isOwnedToolbarManifest({
        label: DEFAULT_TOOLBAR_MANIFEST.label,
        controls: DEFAULT_TOOLBAR_MANIFEST.controls,
      }),
    ).toBe(false);
    expect(isOwnedToolbarManifest(new Proxy({}, { get: () => { throw new Error(); } }))).toBe(
      false,
    );
  });
});

function historyControl(stateId: string, label: string, operation: unknown): unknown {
  return {
    kind: "button",
    stateId,
    label,
    activation: "stateless",
    command: { kind: "history", operation },
  };
}
