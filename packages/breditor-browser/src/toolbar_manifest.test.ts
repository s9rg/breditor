import { describe, expect, it } from "vitest";

import {
  BASE_TOOLBAR_STATE_IDS,
  DEFAULT_TOOLBAR_MANIFEST,
  MAX_TOOLBAR_CONTROLS,
  MAX_TOOLBAR_GROUP_UTF16,
  MAX_TOOLBAR_INLINE_FORMAT_FORM_FIELDS,
  MAX_TOOLBAR_INLINE_FORMAT_FORM_FIELDS_TOTAL,
  MAX_TOOLBAR_INLINE_FORMAT_FORM_INTEGER_SELECT_OPTIONS,
  MAX_TOOLBAR_INLINE_FORMAT_FORM_STRING_UTF8,
  MAX_TOOLBAR_LABEL_UTF16,
  TOOLBAR_INLINE_FORMAT_FORM_RGB24_MAXIMUM,
  TOOLBAR_INLINE_FORMAT_FORM_RGB24_MINIMUM,
  createToolbarManifest,
  isOwnedToolbarManifest,
} from "./toolbar_manifest.js";

describe("toolbar manifest", () => {
  it("publishes clear formatting as an optional base action-state identity", () => {
    expect(BASE_TOOLBAR_STATE_IDS.clearInlineFormatting).toBe(
      "breditor/control-clear-inline-formatting",
    );
    expect(DEFAULT_TOOLBAR_MANIFEST.controls.map(({ label }) => label)).toEqual(
      ["Bold", "Undo", "Redo"],
    );
  });

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
      if (control.kind !== "button") throw new Error("unexpected base control");
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
            input: {
              kind: "string",
              value: "hello",
              callback: () => undefined,
            },
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
    const control = manifest.controls[0]!;
    if (control.kind !== "button") throw new Error("unexpected control kind");
    const command = control.command;
    expect(command.kind).toBe("action");
    expect("execute" in command).toBe(false);
    expect(command.kind === "action" && "callback" in command.input).toBe(
      false,
    );
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
    const control = manifest.controls[0]!;
    if (control.kind !== "button") throw new Error("unexpected control kind");

    expect(control.command).toEqual({
      kind: "intent",
      intentId: "example/format-highlight",
    });
    expect(Object.isFrozen(control.command)).toBe(true);
    expect("history" in control.command).toBe(false);
    expect("input" in control.command).toBe(false);
    expect("execute" in control.command).toBe(false);
  });

  it("deeply snapshots a callback-free inline-format form", () => {
    const source = inlineFormatForm("example/link-presence", [
      {
        kind: "string",
        propertyName: "example/href",
        label: "Address",
        presentation: "url",
        autocomplete: "url",
        minimumUtf8Bytes: 1,
        maximumUtf8Bytes: 2_048,
        placeholder: "https://example.test",
        onInput: () => undefined,
      },
      {
        kind: "boolean",
        propertyName: "example/open-in-new-window",
        label: "Open in new window",
        defaultValue: false,
        onChange: () => undefined,
      },
    ]) as ReturnType<typeof inlineFormatForm> & {
      fields: Array<Record<string, unknown>>;
    };
    Object.assign(source, {
      group: "links",
      onApply: () => undefined,
      executable: { run: () => undefined },
    });

    const manifest = createToolbarManifest({
      label: "Links",
      controls: [source],
    });
    source["label"] = "Changed";
    source.fields[0]!["label"] = "Changed";

    expect(manifest).toEqual({
      label: "Links",
      controls: [
        {
          kind: "inlineFormatForm",
          stateId: "example/link-presence",
          label: "Link",
          group: "links",
          formatKind: "example/link",
          intentId: "example/set-link-intent",
          fields: [
            {
              kind: "string",
              propertyName: "example/href",
              label: "Address",
              presentation: "url",
              autocomplete: "url",
              minimumUtf8Bytes: 1,
              maximumUtf8Bytes: 2_048,
              placeholder: "https://example.test",
            },
            {
              kind: "boolean",
              propertyName: "example/open-in-new-window",
              label: "Open in new window",
              defaultValue: false,
            },
          ],
          applyLabel: "Apply",
          removeLabel: "Remove",
          closeLabel: "Close",
        },
      ],
    });
    const control = manifest.controls[0]!;
    if (control.kind !== "inlineFormatForm") {
      throw new Error("unexpected control kind");
    }
    expect(Object.isFrozen(control)).toBe(true);
    expect(Object.isFrozen(control.fields)).toBe(true);
    expect(control.fields.every(Object.isFrozen)).toBe(true);
    expect("onApply" in control).toBe(false);
    expect("executable" in control).toBe(false);
    expect("onInput" in control.fields[0]!).toBe(false);
    expect("onChange" in control.fields[1]!).toBe(false);
  });

  it("rejects retained form accessors without executing them", () => {
    let reads = 0;
    const form = inlineFormatForm("example/link-presence");
    Object.defineProperty(form, "applyLabel", {
      configurable: true,
      get: () => {
        reads += 1;
        return "Apply";
      },
    });
    expect(() =>
      createToolbarManifest({ label: "Tools", controls: [form] }),
    ).toThrow(/own data property/u);

    const field = urlField("example/href");
    Object.defineProperty(field, "minimumUtf8Bytes", {
      configurable: true,
      get: () => {
        reads += 1;
        return 1;
      },
    });
    expect(() =>
      createToolbarManifest({
        label: "Tools",
        controls: [inlineFormatForm("example/link-presence", [field])],
      }),
    ).toThrow(/own data property/u);

    const colorField = rgb24Field("example/rgb24", 0);
    Object.defineProperty(colorField, "defaultValue", {
      configurable: true,
      get: () => {
        reads += 1;
        return 0;
      },
    });
    expect(() =>
      createToolbarManifest({
        label: "Tools",
        controls: [inlineFormatForm("example/color-presence", [colorField])],
      }),
    ).toThrow(/own data property/u);

    const fields = [urlField("example/href")];
    Object.defineProperty(fields, "0", {
      configurable: true,
      get: () => {
        reads += 1;
        return urlField("example/href");
      },
    });
    expect(() =>
      createToolbarManifest({
        label: "Tools",
        controls: [inlineFormatForm("example/link-presence", fields)],
      }),
    ).toThrow(/own data property/u);
    expect(reads).toBe(0);
  });

  it("requires unique state and property identities across the closed union", () => {
    const form = inlineFormatForm("example/control-shared");
    expect(() =>
      createToolbarManifest({
        label: "Tools",
        controls: [
          historyControl("example/control-shared", "History", "undo"),
          form,
        ],
      }),
    ).toThrow(/state identity is duplicated/u);

    expect(() =>
      createToolbarManifest({
        label: "Tools",
        controls: [
          inlineFormatForm("example/link-presence", [
            urlField("example/href"),
            urlField("example/href"),
          ]),
        ],
      }),
    ).toThrow(/property identity is duplicated/u);
  });

  it("enforces field bounds and requires a value-presenting field", () => {
    expect(() =>
      createToolbarManifest({
        label: "Tools",
        controls: [inlineFormatForm("example/link-presence", [])],
      }),
    ).toThrow(RangeError);
    expect(() =>
      createToolbarManifest({
        label: "Tools",
        controls: [
          inlineFormatForm(
            "example/link-presence",
            Array.from(
              { length: MAX_TOOLBAR_INLINE_FORMAT_FORM_FIELDS + 1 },
              (_, index) =>
                index === 0
                  ? urlField("example/href")
                  : booleanField(`example/flag-${index}`),
            ),
          ),
        ],
      }),
    ).toThrow(RangeError);
    expect(() =>
      createToolbarManifest({
        label: "Tools",
        controls: [
          inlineFormatForm("example/link-presence", [
            booleanField("example/open-in-new-window"),
          ]),
        ],
      }),
    ).toThrow(/requires a URL, RGB24, or integer select value field/u);
    expect(
      createToolbarManifest({
        label: "Tools",
        controls: [
          inlineFormatForm("example/color-presence", [
            rgb24Field("example/rgb24", 0),
          ]),
        ],
      }).controls[0],
    ).toMatchObject({ fields: [{ kind: "integer" }] });

    const fieldCountPerForm =
      Math.floor(MAX_TOOLBAR_INLINE_FORMAT_FORM_FIELDS_TOTAL / 3) + 1;
    expect(() =>
      createToolbarManifest({
        label: "Tools",
        controls: [0, 1, 2].map((formIndex) =>
          inlineFormatForm(
            `example/link-presence-${formIndex}`,
            Array.from({ length: fieldCountPerForm }, (_, fieldIndex) =>
              fieldIndex === 0
                ? urlField(`example/href-${formIndex}`)
                : booleanField(`example/flag-${formIndex}-${fieldIndex}`),
            ),
          ),
        ),
      }),
    ).toThrow(/aggregate bound/u);
  });

  it("enforces URL metadata, exact integer bounds, false Boolean defaults, and labels", () => {
    const invalidFields: unknown[] = [
      { ...urlField("example/href"), presentation: "text" },
      { ...urlField("example/href"), autocomplete: "email" },
      { ...urlField("example/href"), minimumUtf8Bytes: 0 },
      { ...urlField("example/href"), minimumUtf8Bytes: 2, maximumUtf8Bytes: 1 },
      {
        ...urlField("example/href"),
        maximumUtf8Bytes: MAX_TOOLBAR_INLINE_FORMAT_FORM_STRING_UTF8 + 1,
      },
      { ...urlField("example/href"), minimumUtf8Bytes: 1.5 },
      { ...booleanField("example/open-in-new-window"), defaultValue: true },
    ];
    for (const field of invalidFields) {
      expect(() =>
        createToolbarManifest({
          label: "Tools",
          controls: [inlineFormatForm("example/link-presence", [field])],
        }),
      ).toThrow();
    }
    for (const field of ["applyLabel", "removeLabel", "closeLabel"] as const) {
      expect(() =>
        createToolbarManifest({
          label: "Tools",
          controls: [
            { ...inlineFormatForm("example/link-presence"), [field]: "" },
          ],
        }),
      ).toThrow(/action label/u);
    }
  });

  it("admits only the explicit exact RGB24 integer presentation", () => {
    const sourceField = {
      ...rgb24Field("example/rgb24", 0x12abef),
      alpha: true,
      colorSpace: "display-p3",
      onInput: () => undefined,
    };
    const manifest = createToolbarManifest({
      label: "Tools",
      controls: [inlineFormatForm("example/color-presence", [sourceField])],
    });
    expect(manifest.controls[0]).toMatchObject({
      fields: [
        {
          kind: "integer",
          propertyName: "example/rgb24",
          presentation: "rgb24",
          minimum: TOOLBAR_INLINE_FORMAT_FORM_RGB24_MINIMUM,
          maximum: TOOLBAR_INLINE_FORMAT_FORM_RGB24_MAXIMUM,
          defaultValue: 0x12abef,
        },
      ],
    });
    const control = manifest.controls[0];
    if (control?.kind !== "inlineFormatForm") throw new Error("missing form");
    expect(Object.isFrozen(control.fields[0])).toBe(true);
    expect("alpha" in control.fields[0]!).toBe(false);
    expect("colorSpace" in control.fields[0]!).toBe(false);
    expect("onInput" in control.fields[0]!).toBe(false);

    const invalidFields = [
      { ...rgb24Field("example/rgb24", 0), presentation: "number" },
      { ...rgb24Field("example/rgb24", 0), minimum: 1 },
      { ...rgb24Field("example/rgb24", 0), maximum: 16_777_214 },
      { ...rgb24Field("example/rgb24", 0), defaultValue: -0 },
      { ...rgb24Field("example/rgb24", 0), defaultValue: -1 },
      { ...rgb24Field("example/rgb24", 0), defaultValue: 16_777_216 },
      { ...rgb24Field("example/rgb24", 0), defaultValue: 1.5 },
      { ...rgb24Field("example/rgb24", 0), defaultValue: "0" },
    ];
    for (const field of invalidFields) {
      expect(() =>
        createToolbarManifest({
          label: "Tools",
          controls: [inlineFormatForm("example/color-presence", [field])],
        }),
      ).toThrow();
    }
  });

  it("deeply snapshots one exhaustive bounded integer select", () => {
    const source = integerSelectField("example/text-size-step", 1);
    source["onChange"] = () => undefined;
    const sourceOptions = source["options"] as Array<Record<string, unknown>>;
    sourceOptions[0]!["metadata"] = { private: true };
    const manifest = createToolbarManifest({
      label: "Tools",
      controls: [inlineFormatForm("example/text-size-presence", [source])],
    });
    sourceOptions[1]!["label"] = "Changed";

    const control = manifest.controls[0];
    if (control?.kind !== "inlineFormatForm") throw new Error("missing form");
    expect(control.fields[0]).toEqual({
      kind: "integer",
      propertyName: "example/text-size-step",
      label: "Text size",
      presentation: "select",
      minimum: 0,
      maximum: 2,
      defaultValue: 1,
      options: [
        { value: 0, label: "Small" },
        { value: 1, label: "Large" },
        { value: 2, label: "Huge" },
      ],
    });
    const field = control.fields[0];
    if (field?.kind !== "integer" || field.presentation !== "select") {
      throw new Error("missing integer select");
    }
    expect(Object.isFrozen(field)).toBe(true);
    expect(Object.isFrozen(field.options)).toBe(true);
    expect(field.options.every(Object.isFrozen)).toBe(true);
    expect("onChange" in field).toBe(false);
    expect("metadata" in field.options[0]!).toBe(false);
  });

  it("rejects malformed integer select bounds, defaults, and option sets", () => {
    const valid = integerSelectField("example/text-size-step", 1);
    const options = valid["options"] as readonly Record<string, unknown>[];
    const invalidFields: unknown[] = [
      { ...valid, minimum: -0 },
      { ...valid, maximum: -0 },
      { ...valid, defaultValue: -0 },
      { ...valid, defaultValue: 3 },
      { ...valid, defaultValue: 1.5 },
      { ...valid, options: [] },
      { ...valid, options: options.slice(0, 2) },
      { ...valid, maximum: 1 },
      { ...valid, options: [options[1], options[0], options[2]] },
      { ...valid, options: [options[0], options[0], options[2]] },
      { ...valid, options: [options[0], options[2]] },
      { ...valid, options: [{ value: 0, label: "" }] },
      { ...valid, options: [{ value: 0, label: "bad\nlabel" }] },
      {
        ...valid,
        maximum: MAX_TOOLBAR_INLINE_FORMAT_FORM_INTEGER_SELECT_OPTIONS,
        options: Array.from(
          {
            length: MAX_TOOLBAR_INLINE_FORMAT_FORM_INTEGER_SELECT_OPTIONS + 1,
          },
          (_, value) => ({ value, label: `Option ${value}` }),
        ),
      },
    ];
    for (const field of invalidFields) {
      expect(() =>
        createToolbarManifest({
          label: "Tools",
          controls: [inlineFormatForm("example/text-size-presence", [field])],
        }),
      ).toThrow();
    }
  });

  it("rejects sparse and retained-accessor integer select options safely", () => {
    const sparse = new Array(1);
    const field = integerSelectField("example/text-size-step", 1);
    field["minimum"] = 0;
    field["maximum"] = 0;
    field["defaultValue"] = 0;
    field["options"] = sparse;
    expect(() =>
      createToolbarManifest({
        label: "Tools",
        controls: [inlineFormatForm("example/text-size-presence", [field])],
      }),
    ).toThrow(/own data property/u);

    let reads = 0;
    const option = { value: 0 };
    Object.defineProperty(option, "label", {
      get: () => {
        reads += 1;
        return "Private";
      },
    });
    field["options"] = [option];
    expect(() =>
      createToolbarManifest({
        label: "Tools",
        controls: [inlineFormatForm("example/text-size-presence", [field])],
      }),
    ).toThrow(/own data property/u);
    expect(reads).toBe(0);
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
    const owned = createToolbarManifest({
      label: "Tools",
      controls: [control],
    });
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
    const inheritedIndex = Object.create(Array.prototype) as Record<
      string,
      unknown
    >;
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
      createToolbarManifest({ label: "Tools", controls: noOrdinaryReads })
        .controls,
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
    expect(() =>
      createToolbarManifest({ label: "Tools", controls: [] }),
    ).toThrow(RangeError);
    expect(() =>
      createToolbarManifest({
        label: "Tools",
        controls: Array.from({ length: MAX_TOOLBAR_CONTROLS + 1 }, (_, index) =>
          historyControl(
            `example/control-${index}`,
            `Control ${index}`,
            "undo",
          ),
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
    for (const label of [
      "",
      "   ",
      "bad\nlabel",
      "x".repeat(MAX_TOOLBAR_LABEL_UTF16 + 1),
    ]) {
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
        controls: [
          historyControl("example/control-history", "History", "clear"),
        ],
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
    expect(
      isOwnedToolbarManifest(
        new Proxy(
          {},
          {
            get: () => {
              throw new Error();
            },
          },
        ),
      ),
    ).toBe(false);
  });
});

function historyControl(
  stateId: string,
  label: string,
  operation: unknown,
): unknown {
  return {
    kind: "button",
    stateId,
    label,
    activation: "stateless",
    command: { kind: "history", operation },
  };
}

function inlineFormatForm(
  stateId: string,
  fields: unknown[] = [
    urlField("example/href"),
    booleanField("example/open-in-new-window"),
  ],
) {
  return {
    kind: "inlineFormatForm",
    stateId,
    label: "Link",
    formatKind: "example/link",
    intentId: "example/set-link-intent",
    fields,
    applyLabel: "Apply",
    removeLabel: "Remove",
    closeLabel: "Close",
  };
}

function urlField(propertyName: string): Record<string, unknown> {
  return {
    kind: "string",
    propertyName,
    label: "Address",
    presentation: "url",
    autocomplete: "url",
    minimumUtf8Bytes: 1,
    maximumUtf8Bytes: 2_048,
  };
}

function booleanField(propertyName: string): Record<string, unknown> {
  return {
    kind: "boolean",
    propertyName,
    label: "Open in new window",
    defaultValue: false,
  };
}

function rgb24Field(
  propertyName: string,
  defaultValue: unknown,
): Record<string, unknown> {
  return {
    kind: "integer",
    propertyName,
    label: "Text color",
    presentation: "rgb24",
    minimum: TOOLBAR_INLINE_FORMAT_FORM_RGB24_MINIMUM,
    maximum: TOOLBAR_INLINE_FORMAT_FORM_RGB24_MAXIMUM,
    defaultValue,
  };
}

function integerSelectField(
  propertyName: string,
  defaultValue: unknown,
): Record<string, unknown> {
  return {
    kind: "integer",
    propertyName,
    label: "Text size",
    presentation: "select",
    minimum: 0,
    maximum: 2,
    defaultValue,
    options: [
      { value: 0, label: "Small" },
      { value: 1, label: "Large" },
      { value: 2, label: "Huge" },
    ],
  };
}
