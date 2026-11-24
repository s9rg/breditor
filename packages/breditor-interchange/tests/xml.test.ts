import {describe, expect, it, vi} from "vitest";
import {interchangeLimits} from "../src/index.js";
import {exportXml, xmlContractV1} from "../src/xml.js";
import type {InterchangeOwner} from "../src/types.js";
import {all, parseXml} from "./docx_support.js";

const element = (type: string, children: unknown[], properties: Record<string, unknown> = {}) =>
  ({kind: "element", type, entityId: null, properties, children});

function fixture(children: unknown[]) {
  const root = element("breditor/document", children);
  const structuredJson = JSON.stringify({document: {root}});
  const owner = {
    supportsClipboardInterchange: () => true,
    validateClipboard: vi.fn((source: string) => {
      if (source !== structuredJson) throw Error("Unexpected native record");
      return {format: "breditor/rich-clipboard-transfer", formatVersion: 1, kind: "flow", structuredJson, plainText: ""} as const;
    }),
  } satisfies InterchangeOwner;
  return {owner, structuredJson};
}

describe("versioned XML export", () => {
  it("preserves scalar text, escapes markup, and reports XML-incompatible text", () => {
    const paragraph = element("breditor/paragraph", [
      {kind: "text", text: "日本 <&> '\t\n\r🙂\u0001\uFFFF", formats: []},
    ], {"example/property": {value: "\uFFFF&"}});
    const {owner, structuredJson} = fixture([paragraph]);
    const output = exportXml(owner, structuredJson);
    expect(owner.validateClipboard).toHaveBeenCalledWith(structuredJson);
    expect(output.ok).toBe(true);
    if (!output.ok) throw Error(output.error);
    expect(output.losses).toEqual([{code: "removed-content", count: 2, effect: "loss"}]);
    const parsed = parseXml(output.value);
    expect(parsed.attributes).toMatchObject({"xmlns:breditor": xmlContractV1.namespace, version: "1", kind: "flow"});
    expect(all(parsed, "breditor:value")[0]?.children).toEqual(["日本 <&> '\t\n\r🙂\uFFFD\uFFFD"]);
    expect(JSON.parse(String(all(parsed, "breditor:property")[0]?.children[0]))).toEqual({value: "\uFFFF&"});
  });

  it("rejects inputs refused by the native owner or beyond the source limit", () => {
    const {owner} = fixture([]);
    expect(exportXml(owner, "{}")).toMatchObject({ok: false, error: "native-admission"});
    owner.validateClipboard.mockClear();
    expect(exportXml(owner, "x".repeat(interchangeLimits.sourceBytes + 1))).toMatchObject({ok: false, error: "resource-limit"});
    expect(owner.validateClipboard).not.toHaveBeenCalled();
  });

  it("rejects excessive output expansion without returning partial XML", () => {
    const root = element("breditor/paragraph", [
      {kind: "text", text: "&".repeat(900_000), formats: []},
    ]);
    const {owner, structuredJson} = fixture([root]);
    expect(exportXml(owner, structuredJson)).toEqual({ok: false, error: "resource-limit", losses: []});
  });
});
