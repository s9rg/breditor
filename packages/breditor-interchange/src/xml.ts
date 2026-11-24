/** Explicit XML export of a native semantic clipboard record. */
import {Budget, bytes, ConversionFailure, fail, limits, sourceWithinBudget} from "./budget.js";
import type {InterchangeOwner, InterchangeResult} from "./types.js";
import type {Literal, Text} from "./wire.js";

interface Element {
  readonly kind: "element";
  readonly type: string;
  readonly entityId: string | null;
  readonly properties: Readonly<Record<string, unknown>>;
  readonly children: readonly (Element | Text)[];
}

export const xmlContractV1 = Object.freeze({
  version: 1,
  namespace: "urn:breditor:interchange:xml:1",
  outputBytes: 4 * limits.outputBytes,
} as const);

const entities: Readonly<Record<string, string>> = Object.freeze({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;",
  "\t": "&#9;", "\n": "&#10;", "\r": "&#13;",
});

class XmlWriter {
  readonly #parts: string[] = [];
  #bytes = 0;
  constructor(readonly budget: Budget) {}

  append(value: string): void {
    this.#bytes += bytes(value);
    if (this.#bytes > xmlContractV1.outputBytes) fail("resource-limit");
    this.#parts.push(value);
  }

  escape(value: string): string {
    const safe = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, () => {
      this.budget.loss("removed-content");
      return "\uFFFD";
    });
    return safe.replace(/[&<>"'\t\n\r]/g, character => entities[character]!);
  }

  properties(properties: Readonly<Record<string, unknown>>): void {
    for (const name of Object.keys(properties).sort()) {
      const value = JSON.stringify(properties[name]);
      if (value === undefined) fail("native-admission");
      // JSON can represent these scalars even though XML 1.0 text cannot.
      const json = value.replace(/\uFFFE/g, "\\ufffe").replace(/\uFFFF/g, "\\uffff");
      this.append(`<breditor:property name="${this.escape(name)}">${this.escape(json)}</breditor:property>`);
    }
  }

  format(format: Literal): void {
    this.append(`<breditor:format type="${this.escape(format.type)}">`);
    this.properties(format.properties);
    this.append("</breditor:format>");
  }

  node(node: Element | Text, depth: number): void {
    this.budget.node();
    if (depth > limits.depth) fail("resource-limit");
    if (node.kind === "text") {
      this.append("<breditor:run>");
      for (const mark of node.formats) this.format(mark);
      this.append(`<breditor:value>${this.escape(node.text)}</breditor:value></breditor:run>`);
      return;
    }
    if (node.kind !== "element") fail("native-admission");
    const entity = node.entityId === null ? "" : ` entity-id="${this.escape(node.entityId)}"`;
    this.append(`<breditor:element type="${this.escape(node.type)}"${entity}>`);
    this.properties(node.properties);
    for (const child of node.children) this.node(child, depth + 1);
    this.append("</breditor:element>");
  }

  result(): string {
    return this.#parts.join("");
  }
}

/** Supply the same native owner that produced or admits the clipboard record. */
export function exportXml(owner: InterchangeOwner, clipboardJson: string): InterchangeResult<string> {
  const budget = new Budget();
  try {
    sourceWithinBudget(clipboardJson);
    const validate = owner.validateClipboard;
    if (owner.supportsClipboardInterchange?.() !== true || typeof validate !== "function") fail("native-admission");
    const {format, formatVersion, kind, structuredJson} = validate.call(owner, clipboardJson);
    if (format !== "breditor/rich-clipboard-transfer" || formatVersion !== 1) fail("native-admission");
    if (kind !== "text" && kind !== "flow" && kind !== "grid") fail("native-admission");
    sourceWithinBudget(structuredJson);
    const {document: {root}} = JSON.parse(structuredJson) as {document: {root: Element}};
    if (root.kind !== "element" || root.type !== "breditor/document") fail("native-admission");
    const writer = new XmlWriter(budget);
    writer.append(`<?xml version="1.0" encoding="UTF-8"?><breditor:document xmlns:breditor="${xmlContractV1.namespace}" version="${xmlContractV1.version}" kind="${kind}">`);
    writer.node(root, 0);
    writer.append("</breditor:document>");
    return Object.freeze({ok: true, value: writer.result(), losses: budget.losses()});
  } catch (error) {
    return Object.freeze({
      ok: false,
      error: error instanceof ConversionFailure ? error.code : "native-admission",
      losses: budget.losses(),
    });
  }
}
