import { describe, expect, it } from "vitest";

import {
  DEFAULT_KEYBOARD_SHORTCUT_MANIFEST,
  MAX_KEYBOARD_SHORTCUT_CHORDS_PER_DECLARATION,
  MAX_KEYBOARD_SHORTCUT_CHORDS_TOTAL,
  MAX_KEYBOARD_SHORTCUT_DECLARATIONS,
  MAX_KEYBOARD_SHORTCUT_STATE_ID_ASCII,
  createKeyboardShortcutManifest,
  isOwnedKeyboardShortcutManifest,
} from "./keyboard_shortcut_manifest.js";
import { BASE_TOOLBAR_STATE_IDS } from "./toolbar_manifest.js";

describe("keyboard shortcut manifest", () => {
  it("publishes the deeply frozen, owned base Bold and history presentation", () => {
    expect(DEFAULT_KEYBOARD_SHORTCUT_MANIFEST).toEqual({
      shortcuts: [
        {
          stateId: BASE_TOOLBAR_STATE_IDS.bold,
          chords: [{ code: "KeyB", shift: false }],
        },
        {
          stateId: BASE_TOOLBAR_STATE_IDS.redo,
          chords: [
            { code: "KeyY", shift: false },
            { code: "KeyZ", shift: true },
          ],
        },
        {
          stateId: BASE_TOOLBAR_STATE_IDS.undo,
          chords: [{ code: "KeyZ", shift: false }],
        },
      ],
    });
    expect(isOwnedKeyboardShortcutManifest(DEFAULT_KEYBOARD_SHORTCUT_MANIFEST)).toBe(
      true,
    );
    expect(Object.isFrozen(DEFAULT_KEYBOARD_SHORTCUT_MANIFEST)).toBe(true);
    expect(Object.isFrozen(DEFAULT_KEYBOARD_SHORTCUT_MANIFEST.shortcuts)).toBe(true);
    for (const declaration of DEFAULT_KEYBOARD_SHORTCUT_MANIFEST.shortcuts) {
      expect(Object.isFrozen(declaration)).toBe(true);
      expect(Object.isFrozen(declaration.chords)).toBe(true);
      expect(declaration.chords.every(Object.isFrozen)).toBe(true);
    }
  });

  it("copies, canonicalizes, and freezes caller data without retaining it", () => {
    const source = {
      shortcuts: [
        {
          stateId: "example/control-zeta",
          chords: [
            { code: "KeyT", shift: true },
            { code: "KeyQ", shift: false },
            { code: "KeyT", shift: false },
          ],
        },
        {
          stateId: "example/control-alpha",
          chords: [{ code: "KeyI", shift: false }],
        },
      ],
    };

    const manifest = createKeyboardShortcutManifest(source);
    source.shortcuts[0]!.stateId = "example/control-changed";
    source.shortcuts[0]!.chords[0]!.code = "KeyW";

    expect(manifest).toEqual({
      shortcuts: [
        {
          stateId: "example/control-alpha",
          chords: [{ code: "KeyI", shift: false }],
        },
        {
          stateId: "example/control-zeta",
          chords: [
            { code: "KeyQ", shift: false },
            { code: "KeyT", shift: false },
            { code: "KeyT", shift: true },
          ],
        },
      ],
    });
    expect(Object.isFrozen(manifest)).toBe(true);
    expect(Object.isFrozen(manifest.shortcuts)).toBe(true);
    expect(manifest.shortcuts.every(Object.isFrozen)).toBe(true);
    expect(manifest.shortcuts.flatMap(({ chords }) => chords).every(Object.isFrozen)).toBe(
      true,
    );
  });

  it("accepts an empty presentation and the exact per-state chord bound", () => {
    expect(createKeyboardShortcutManifest({ shortcuts: [] })).toEqual({
      shortcuts: [],
    });
    expect(
      createKeyboardShortcutManifest({
        shortcuts: [
          {
            stateId: "example/control-many",
            chords: Array.from(
              { length: MAX_KEYBOARD_SHORTCUT_CHORDS_PER_DECLARATION },
              (_, index) => ({
                code: `Key${String.fromCharCode("D".charCodeAt(0) + index)}`,
                shift: false,
              }),
            ),
          },
        ],
      }).shortcuts[0]?.chords,
    ).toHaveLength(MAX_KEYBOARD_SHORTCUT_CHORDS_PER_DECLARATION);
  });

  it("admits the complete finite chord domain at its exact aggregate bounds", () => {
    const coreChordCodes = new Set(["0:KeyB", "0:KeyY", "0:KeyZ", "1:KeyZ"]);
    const remaining = [] as Array<{ code: string; shift: boolean }>;
    for (let letter = "A".charCodeAt(0); letter <= "Z".charCodeAt(0); letter += 1) {
      const code = `Key${String.fromCharCode(letter)}`;
      if (["KeyA", "KeyC", "KeyV", "KeyX"].includes(code)) continue;
      for (const shift of [false, true]) {
        if (!coreChordCodes.has(`${shift ? "1" : "0"}:${code}`)) {
          remaining.push({ code, shift });
        }
      }
    }
    const manifest = createKeyboardShortcutManifest({
      shortcuts: [
        declaration(BASE_TOOLBAR_STATE_IDS.bold, "KeyB"),
        {
          stateId: BASE_TOOLBAR_STATE_IDS.redo,
          chords: [
            { code: "KeyY", shift: false },
            { code: "KeyZ", shift: true },
          ],
        },
        declaration(BASE_TOOLBAR_STATE_IDS.undo, "KeyZ"),
        ...remaining.map((chord, index) => ({
          stateId: `example/control-${String(index).padStart(2, "0")}`,
          chords: [chord],
        })),
      ],
    });

    expect(manifest.shortcuts).toHaveLength(MAX_KEYBOARD_SHORTCUT_DECLARATIONS);
    expect(
      manifest.shortcuts.reduce((total, shortcut) => total + shortcut.chords.length, 0),
    ).toBe(MAX_KEYBOARD_SHORTCUT_CHORDS_TOTAL);
  });

  it("rejects duplicate state identities and duplicate chords within or across states", () => {
    expect(() =>
      createKeyboardShortcutManifest({
        shortcuts: [declaration("example/control-one", "KeyI"), declaration("example/control-one", "KeyJ")],
      }),
    ).toThrow(TypeError);
    expect(() =>
      createKeyboardShortcutManifest({
        shortcuts: [
          {
            stateId: "example/control-one",
            chords: [
              { code: "KeyI", shift: false },
              { code: "KeyI", shift: false },
            ],
          },
        ],
      }),
    ).toThrow(TypeError);
    expect(() =>
      createKeyboardShortcutManifest({
        shortcuts: [declaration("example/control-one", "KeyI"), declaration("example/control-two", "KeyI")],
      }),
    ).toThrow(TypeError);
  });

  it.each(["a", "c", "v", "x"])(
    "reserves primary-modifier %s with or without Shift for native editing",
    (letter) => {
      const code = `Key${letter.toUpperCase()}`;
      for (const shift of [false, true]) {
        expect(() =>
          createKeyboardShortcutManifest({
            shortcuts: [declaration("example/control-native", code, shift)],
          }),
        ).toThrow(TypeError);
      }
    },
  );

  it("allows core chords to be omitted or target their exact state, but never rebound", () => {
    expect(() =>
      createKeyboardShortcutManifest({
        shortcuts: [
          declaration(BASE_TOOLBAR_STATE_IDS.bold, "KeyB"),
          declaration(BASE_TOOLBAR_STATE_IDS.redo, "KeyY"),
          declaration(BASE_TOOLBAR_STATE_IDS.undo, "KeyZ"),
        ],
      }),
    ).not.toThrow();
    expect(() =>
      createKeyboardShortcutManifest({
        shortcuts: [declaration(BASE_TOOLBAR_STATE_IDS.redo, "KeyZ", true)],
      }),
    ).not.toThrow();

    for (const chord of [
      { code: "KeyB", shift: false },
      { code: "KeyY", shift: false },
      { code: "KeyZ", shift: false },
      { code: "KeyZ", shift: true },
    ] as const) {
      expect(() =>
        createKeyboardShortcutManifest({
          shortcuts: [
            declaration("example/control-rebound", chord.code, chord.shift),
          ],
        }),
      ).toThrow(TypeError);
    }
  });

  it("rejects malformed identities, physical codes, Shift values, and extra schema fields", () => {
    const exactMaximumStateId = `e/${"q".repeat(MAX_KEYBOARD_SHORTCUT_STATE_ID_ASCII - 2)}`;
    expect(() =>
      createKeyboardShortcutManifest({
        shortcuts: [declaration(exactMaximumStateId, "KeyI")],
      }),
    ).not.toThrow();

    for (const stateId of [
      "missing-slash",
      "Example/control",
      "example/two/slashes",
      `e/${"q".repeat(MAX_KEYBOARD_SHORTCUT_STATE_ID_ASCII - 1)}`,
    ]) {
      expect(() =>
        createKeyboardShortcutManifest({
          shortcuts: [declaration(stateId, "KeyI")],
        }),
      ).toThrow(TypeError);
    }
    for (const code of [
      "I",
      "Key1",
      "Keyé",
      "KeyII",
      "Keyi",
      "Digit1",
      "",
    ] as const) {
      expect(() =>
        createKeyboardShortcutManifest({
          shortcuts: [declaration("example/control-code", code)],
        }),
      ).toThrow(TypeError);
    }
    expect(() =>
      createKeyboardShortcutManifest({
        shortcuts: [
          {
            stateId: "example/control-shift",
            chords: [{ code: "KeyI", shift: 1 }],
          },
        ],
      }),
    ).toThrow(TypeError);
    expect(() =>
      createKeyboardShortcutManifest({ shortcuts: [], callback: () => undefined }),
    ).toThrow(TypeError);
    expect(() =>
      createKeyboardShortcutManifest({
        shortcuts: [
          { ...declaration("example/control-extra", "KeyI"), priority: 1 },
        ],
      }),
    ).toThrow(TypeError);
    expect(() =>
      createKeyboardShortcutManifest({
        shortcuts: [
          {
            stateId: "example/control-extra",
            chords: [{ code: "KeyI", shift: false, alt: false }],
          },
        ],
      }),
    ).toThrow(TypeError);
    expect(() =>
      createKeyboardShortcutManifest({
        shortcuts: [
          {
            stateId: "example/control-logical-key",
            chords: [{ key: "i", shift: false }],
          },
        ],
      }),
    ).toThrow(TypeError);
  });

  it("enforces dense own-data arrays and fixed count bounds without invoking accessors", () => {
    for (const forgedLength of [-1, -0] as const) {
      const forgedArray = new Proxy([], {
        getOwnPropertyDescriptor: (target, key) =>
          key === "length"
            ? {
                value: forgedLength,
                writable: true,
                enumerable: false,
                configurable: false,
              }
            : Reflect.getOwnPropertyDescriptor(target, key),
        ownKeys: () => ["length"],
      });
      expect(() =>
        createKeyboardShortcutManifest({ shortcuts: forgedArray }),
      ).toThrow(TypeError);
    }
    expect(() =>
      createKeyboardShortcutManifest({ shortcuts: new Array(1) }),
    ).toThrow(TypeError);
    expect(() =>
      createKeyboardShortcutManifest({
        shortcuts: [
          { stateId: "example/control-empty", chords: [] },
        ],
      }),
    ).toThrow(RangeError);
    expect(() =>
      createKeyboardShortcutManifest({
        shortcuts: [
          {
            stateId: "example/control-too-many",
            chords: Array.from(
              { length: MAX_KEYBOARD_SHORTCUT_CHORDS_PER_DECLARATION + 1 },
              (_, index) => ({
                code: `Key${String.fromCharCode("D".charCodeAt(0) + index)}`,
                shift: false,
              }),
            ),
          },
        ],
      }),
    ).toThrow(RangeError);
    expect(() =>
      createKeyboardShortcutManifest({
        shortcuts: Array.from(
          { length: MAX_KEYBOARD_SHORTCUT_DECLARATIONS + 1 },
          () => ({}),
        ),
      }),
    ).toThrow(RangeError);

    expect(() =>
      createKeyboardShortcutManifest({
        shortcuts: new Array(100_000_000),
      }),
    ).toThrow(RangeError);

    let oversizedElementReads = 0;
    let oversizedOwnKeyReads = 0;
    const oversizedProxy = new Proxy([], {
      getOwnPropertyDescriptor: (target, key) => {
        if (key === "length") {
          return {
            value: Number.MAX_SAFE_INTEGER,
            writable: true,
            enumerable: false,
            configurable: false,
          };
        }
        oversizedElementReads += 1;
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
      ownKeys: () => {
        oversizedOwnKeyReads += 1;
        return ["length"];
      },
    });
    expect(() =>
      createKeyboardShortcutManifest({ shortcuts: oversizedProxy }),
    ).toThrow(RangeError);
    expect(oversizedElementReads).toBe(0);
    expect(oversizedOwnKeyReads).toBe(0);
    expect(() =>
      createKeyboardShortcutManifest({
        shortcuts: aggregateOverflowDeclarations(),
      }),
    ).toThrow(RangeError);

    let reads = 0;
    const declarationAccessor = {};
    Object.defineProperty(declarationAccessor, "stateId", {
      enumerable: true,
      get: () => {
        reads += 1;
        return "example/control-accessor";
      },
    });
    Object.defineProperty(declarationAccessor, "chords", {
      enumerable: true,
      value: [{ code: "KeyI", shift: false }],
    });
    expect(() =>
      createKeyboardShortcutManifest({ shortcuts: [declarationAccessor] }),
    ).toThrow(TypeError);
    expect(reads).toBe(0);

    const elementAccessor = [declaration("example/control-accessor", "KeyI")];
    Object.defineProperty(elementAccessor, "0", {
      configurable: true,
      enumerable: true,
      get: () => {
        reads += 1;
        return declaration("example/control-accessor", "KeyI");
      },
    });
    expect(() =>
      createKeyboardShortcutManifest({ shortcuts: elementAccessor }),
    ).toThrow(TypeError);
    expect(reads).toBe(0);
  });

  it("does not accept structural forgeries or hostile proxies as owned", () => {
    expect(
      isOwnedKeyboardShortcutManifest({
        shortcuts: DEFAULT_KEYBOARD_SHORTCUT_MANIFEST.shortcuts,
      }),
    ).toBe(false);
    expect(
      isOwnedKeyboardShortcutManifest(
        new Proxy({}, { get: () => { throw new Error("must be contained"); } }),
      ),
    ).toBe(false);
  });
});

function declaration(stateId: string, code: string, shift = false) {
  return { stateId, chords: [{ code, shift }] };
}

function aggregateOverflowDeclarations() {
  const coreChordCodes = new Set(["0:KeyB", "0:KeyY", "0:KeyZ", "1:KeyZ"]);
  const remaining: Array<{ code: string; shift: boolean }> = [];
  for (let letter = "A".charCodeAt(0); letter <= "Z".charCodeAt(0); letter += 1) {
    const code = `Key${String.fromCharCode(letter)}`;
    if (["KeyA", "KeyC", "KeyV", "KeyX"].includes(code)) continue;
    for (const shift of [false, true]) {
      if (!coreChordCodes.has(`${shift ? "1" : "0"}:${code}`)) {
        remaining.push({ code, shift });
      }
    }
  }
  return [
    declaration(BASE_TOOLBAR_STATE_IDS.bold, "KeyB"),
    {
      stateId: BASE_TOOLBAR_STATE_IDS.redo,
      chords: [
        { code: "KeyY", shift: false },
        { code: "KeyZ", shift: true },
      ],
    },
    declaration(BASE_TOOLBAR_STATE_IDS.undo, "KeyZ"),
    ...Array.from({ length: Math.ceil(remaining.length / 4) }, (_, index) => ({
      stateId: `example/control-packed-${String(index).padStart(2, "0")}`,
      chords: remaining.slice(index * 4, index * 4 + 4),
    })),
    declaration("example/control-overflow", remaining[0]!.code, remaining[0]!.shift),
  ];
}
