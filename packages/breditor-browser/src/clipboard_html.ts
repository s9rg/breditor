import {
  defaultTreeAdapter,
  parseFragment,
  type DefaultTreeAdapterMap,
  type DefaultTreeAdapterTypes,
  type TreeAdapter,
} from "parse5";

import { browserCommandTextIsAdmissible } from "./editor_command.js";
import {
  isOwnedBrowserCompiledPresentation,
  type BrowserCompiledPresentation,
} from "./compiled_browser_presentation.js";
import {
  inlineFormatRenderAttributesAreCanonicalForPolicy,
  type InlineFormatRenderAttribute,
} from "./inline_format_render_attributes.js";
import type { InlineFormatRenderRecipe } from "./inline_format_render_manifest.js";

/** Maximum UTF-16 code units read from one `text/html` clipboard item. */
export const MAX_CLIPBOARD_HTML_SOURCE_UTF16 = 2 * 1024 * 1024;

/** Maximum UTF-8 bytes read from one `text/html` clipboard item. */
export const MAX_CLIPBOARD_HTML_SOURCE_UTF8 = 2 * 1024 * 1024;

/** Maximum parsed nodes inspected before HTML admission fails closed. */
export const MAX_CLIPBOARD_HTML_NODES = 65_536;

/** Maximum admitted depth: fragment -> p -> strong/b -> text. */
export const MAX_CLIPBOARD_HTML_DEPTH = 3;

/** Maximum semantic format wrappers admitted around one profiled text run. */
export const MAX_CLIPBOARD_HTML_FORMATS_PER_RUN = 32;

/** Maximum profiled depth: fragment -> p -> 32 wrappers -> text. */
export const MAX_CLIPBOARD_HTML_PROFILE_DEPTH =
  MAX_CLIPBOARD_HTML_FORMATS_PER_RUN + 2;

/** Maximum source blocks and normalized plain-text paragraphs. */
export const MAX_CLIPBOARD_HTML_PARAGRAPHS = 10_000;

/** Stable, payload-redacted HTML clipboard failures. */
export type ClipboardHtmlErrorCode =
  | "clipboard.html.invalid_source"
  | "clipboard.html.unsupported_structure"
  | "clipboard.html.empty"
  | "clipboard.html.resource_limit";

/** A safe HTML admission diagnostic which never contains clipboard text. */
export interface ClipboardHtmlError {
  readonly code: ClipboardHtmlErrorCode;
  readonly message: string;
}

/** Total result of bounded HTML parsing and plain-text flattening. */
export type ClipboardHtmlParseResult =
  | Readonly<{ ok: true; value: string }>
  | Readonly<{ ok: false; error: ClipboardHtmlError }>;

type ChildNode = DefaultTreeAdapterTypes.ChildNode;
type Element = DefaultTreeAdapterTypes.Element;
type TextNode = DefaultTreeAdapterTypes.TextNode;

interface AdmissionBudget {
  nodes: number;
  paragraphs: number;
}

interface InlineWrapperAdmission {
  readonly formatKind: string;
  readonly order: number;
  readonly recipe?: InlineFormatRenderRecipe;
}

interface InlineAdmission {
  readonly maximumFormatsPerRun: number;
  readonly wrappersBySignature: ReadonlyMap<string, InlineWrapperAdmission>;
}

type ParagraphResult =
  | Readonly<{ ok: true; value: string }>
  | Readonly<{ ok: false; code: ClipboardHtmlErrorCode }>;

const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";
const PARSE_ABORT = Symbol("Breditor clipboard HTML parse abort");
// parse5 creates a small synthetic fragment context in addition to the result
// tree. These construction budgets stop hostile repaired input before parse5
// can materialize an unbounded transient tree.
const MAX_PARSE_CONSTRUCTED_NODES = MAX_CLIPBOARD_HTML_NODES + 32;
const MAX_PARSE_TREE_MUTATIONS = MAX_CLIPBOARD_HTML_NODES * 4 + 128;
const MAX_PARSE_OPEN_ELEMENTS = MAX_CLIPBOARD_HTML_PROFILE_DEPTH + 8;

const ERROR_MESSAGES: Readonly<Record<ClipboardHtmlErrorCode, string>> =
  Object.freeze({
    "clipboard.html.invalid_source":
      "The clipboard HTML source is invalid.",
    "clipboard.html.unsupported_structure":
      "The clipboard HTML uses structure outside the base allowlist.",
    "clipboard.html.empty":
      "The clipboard HTML contains no insertable plain text.",
    "clipboard.html.resource_limit":
      "The clipboard HTML exceeds a fixed resource limit.",
  });

/**
 * Parses bounded clipboard HTML and returns only admitted plain text.
 *
 * This function never creates browser DOM nodes and never returns markup. The
 * complete parse5 result tree must fit the following closed vocabulary before
 * any text is published:
 *
 * - direct HTML-namespace, attribute-free `<p>` blocks;
 * - non-empty direct text runs and attribute-free `<strong>` or `<b>` runs
 *   when the optional presentation is omitted;
 * - otherwise, exact tag/class signatures and closed policy-derived attributes
 *   from one owned presentation in its canonical outer-to-inner order;
 * - an empty paragraph represented by either no children or one sole `<br>`;
 * - optionally, exact `StartFragment` and `EndFragment` comments surrounding
 *   all top-level paragraphs.
 *
 * Adjacent runs with the same complete format set are rejected as
 * noncanonical.
 * Paragraphs are flattened with LF separators, and strong markup deliberately
 * carries no formatting into the current plain-text insertion action.
 *
 * The allowlist applies to parse5's repaired result tree, not to an invented
 * source-language grammar. Parse errors are rejected, but HTML's normal error
 * recovery does not report every omitted end tag as an error.
 */
export function parseClipboardHtmlToPlainText(
  source: unknown,
  presentation?: BrowserCompiledPresentation,
): ClipboardHtmlParseResult {
  const inlineAdmission = createInlineAdmission(presentation);
  if (inlineAdmission === null) {
    return failure("clipboard.html.invalid_source");
  }
  if (typeof source !== "string" || source.length === 0) {
    return failure("clipboard.html.invalid_source");
  }
  if (source.length > MAX_CLIPBOARD_HTML_SOURCE_UTF16) {
    return failure("clipboard.html.resource_limit");
  }
  const sourceBytes = unicodeScalarUtf8Length(source);
  if (sourceBytes === null) {
    return failure("clipboard.html.invalid_source");
  }
  if (sourceBytes > MAX_CLIPBOARD_HTML_SOURCE_UTF8) {
    return failure("clipboard.html.resource_limit");
  }

  let fragment: DefaultTreeAdapterTypes.DocumentFragment;
  let controlCharacterReferences = 0;
  let parseResourceExceeded = false;
  try {
    const treeAdapter = createBoundedTreeAdapter((): never => {
      parseResourceExceeded = true;
      throw PARSE_ABORT;
    });
    fragment = parseFragment(source, {
      scriptingEnabled: false,
      sourceCodeLocationInfo: false,
      treeAdapter,
      onParseError: (error) => {
        // The copy serializer uses exactly `&#13;` so an inline CR survives
        // HTML input preprocessing. parse5 correctly reports every such
        // control-character reference. Defer this one code to result-tree
        // validation; all other tokenizer/tree-builder errors abort at once.
        if (error.code === "control-character-reference") {
          controlCharacterReferences += 1;
          if (controlCharacterReferences > MAX_CLIPBOARD_HTML_NODES) {
            parseResourceExceeded = true;
            throw PARSE_ABORT;
          }
          return;
        }
        throw PARSE_ABORT;
      },
    });
  } catch {
    return failure(
      parseResourceExceeded
        ? "clipboard.html.resource_limit"
        : "clipboard.html.invalid_source",
    );
  }

  try {
    const admitted = admitFragment(fragment, inlineAdmission);
    if (
      admitted.ok &&
      characterCount(admitted.value, 0x0d) !== controlCharacterReferences
    ) {
      return failure("clipboard.html.invalid_source");
    }
    return admitted;
  } catch {
    return failure("clipboard.html.invalid_source");
  }
}

/**
 * Wraps parse5's default AST adapter with construction-time resource limits.
 *
 * Counting both constructed nodes and mutations matters because HTML repair
 * may detach or reparent nodes which do not survive into the returned tree.
 * The final admission walk remains authoritative for the public vocabulary.
 */
function createBoundedTreeAdapter(
  resourceLimit: () => never,
): TreeAdapter<DefaultTreeAdapterMap> {
  const observedNodes = new WeakSet<object>();
  let constructedNodes = 0;
  let treeMutations = 0;
  let openElements = 0;

  const observe = <Node extends object>(node: Node): Node => {
    if (!observedNodes.has(node)) {
      observedNodes.add(node);
      constructedNodes += 1;
      if (constructedNodes > MAX_PARSE_CONSTRUCTED_NODES) resourceLimit();
    }
    return node;
  };
  const consumeMutation = (): void => {
    treeMutations += 1;
    if (treeMutations > MAX_PARSE_TREE_MUTATIONS) resourceLimit();
  };

  const adapter: TreeAdapter<DefaultTreeAdapterMap> = {
    ...defaultTreeAdapter,
    createDocument() {
      return observe(defaultTreeAdapter.createDocument());
    },
    createDocumentFragment() {
      return observe(defaultTreeAdapter.createDocumentFragment());
    },
    createElement(tagName, namespaceURI, attrs) {
      return observe(
        defaultTreeAdapter.createElement(tagName, namespaceURI, attrs),
      );
    },
    createCommentNode(data) {
      return observe(defaultTreeAdapter.createCommentNode(data));
    },
    createTextNode(value) {
      return observe(defaultTreeAdapter.createTextNode(value));
    },
    appendChild(parentNode, newNode) {
      consumeMutation();
      observe(parentNode);
      observe(newNode);
      defaultTreeAdapter.appendChild(parentNode, newNode);
    },
    insertBefore(parentNode, newNode, referenceNode) {
      consumeMutation();
      observe(parentNode);
      observe(newNode);
      observe(referenceNode);
      defaultTreeAdapter.insertBefore(parentNode, newNode, referenceNode);
    },
    insertText(parentNode, text) {
      const previous = parentNode.childNodes.at(-1);
      if (previous !== undefined && defaultTreeAdapter.isTextNode(previous)) {
        consumeMutation();
        previous.value += text;
        return;
      }
      adapter.appendChild(parentNode, adapter.createTextNode(text));
    },
    insertTextBefore(parentNode, text, referenceNode) {
      const referenceIndex = parentNode.childNodes.indexOf(referenceNode);
      const previous = parentNode.childNodes[referenceIndex - 1];
      if (previous !== undefined && defaultTreeAdapter.isTextNode(previous)) {
        consumeMutation();
        previous.value += text;
        return;
      }
      adapter.insertBefore(
        parentNode,
        adapter.createTextNode(text),
        referenceNode,
      );
    },
    detachNode(node) {
      consumeMutation();
      observe(node);
      defaultTreeAdapter.detachNode(node);
    },
    adoptAttributes(recipient, attrs) {
      consumeMutation();
      observe(recipient);
      defaultTreeAdapter.adoptAttributes(recipient, attrs);
    },
    setTemplateContent(templateElement, contentElement) {
      consumeMutation();
      observe(templateElement);
      observe(contentElement);
      defaultTreeAdapter.setTemplateContent(templateElement, contentElement);
    },
    setDocumentType(document, name, publicId, systemId) {
      consumeMutation();
      observe(document);
      defaultTreeAdapter.setDocumentType(document, name, publicId, systemId);
      for (const child of document.childNodes) observe(child);
    },
    onItemPush(item) {
      observe(item);
      openElements += 1;
      if (openElements > MAX_PARSE_OPEN_ELEMENTS) resourceLimit();
    },
    onItemPop() {
      if (openElements > 0) openElements -= 1;
    },
  };
  return adapter;
}

function admitFragment(
  fragment: DefaultTreeAdapterTypes.DocumentFragment,
  inlineAdmission: InlineAdmission,
): ClipboardHtmlParseResult {
  const budget: AdmissionBudget = { nodes: 1, paragraphs: 0 };
  if (fragment.childNodes.length + budget.nodes > MAX_CLIPBOARD_HTML_NODES) {
    return failure("clipboard.html.resource_limit");
  }

  const content = unwrapFragmentComments(fragment.childNodes, budget);
  if (!content.ok) return failure(content.code);
  if (content.value.length === 0) {
    return failure("clipboard.html.unsupported_structure");
  }

  const paragraphs: string[] = [];
  for (const node of content.value) {
    const paragraph = admitParagraph(node, budget, inlineAdmission);
    if (!paragraph.ok) return failure(paragraph.code);
    paragraphs.push(paragraph.value);
  }

  const value = paragraphs.join("\n");
  if (value.length === 0) {
    return failure("clipboard.html.empty");
  }
  if (
    normalizedParagraphCount(value) > MAX_CLIPBOARD_HTML_PARAGRAPHS ||
    !browserCommandTextIsAdmissible(value)
  ) {
    return failure("clipboard.html.resource_limit");
  }
  return Object.freeze({ ok: true, value });
}

function unwrapFragmentComments(
  nodes: readonly ChildNode[],
  budget: AdmissionBudget,
):
  | Readonly<{ ok: true; value: readonly ChildNode[] }>
  | Readonly<{ ok: false; code: ClipboardHtmlErrorCode }> {
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  const hasBoundaryComment =
    isCommentNode(first) || isCommentNode(last);
  if (!hasBoundaryComment) {
    return Object.freeze({ ok: true, value: nodes });
  }
  if (
    nodes.length < 3 ||
    !isCommentNode(first) ||
    first.data !== "StartFragment" ||
    !isCommentNode(last) ||
    last.data !== "EndFragment"
  ) {
    return Object.freeze({
      ok: false,
      code: "clipboard.html.unsupported_structure",
    });
  }
  if (!consumeNodes(budget, 2)) {
    return Object.freeze({ ok: false, code: "clipboard.html.resource_limit" });
  }
  return Object.freeze({ ok: true, value: nodes.slice(1, -1) });
}

function admitParagraph(
  node: ChildNode,
  budget: AdmissionBudget,
  inlineAdmission: InlineAdmission,
): ParagraphResult {
  if (!consumeNodes(budget, 1)) return paragraphFailure("clipboard.html.resource_limit");
  if (!isExactElement(node, "p")) {
    return paragraphFailure("clipboard.html.unsupported_structure");
  }
  budget.paragraphs += 1;
  if (budget.paragraphs > MAX_CLIPBOARD_HTML_PARAGRAPHS) {
    return paragraphFailure("clipboard.html.resource_limit");
  }

  const children = node.childNodes;
  if (children.length === 0) return Object.freeze({ ok: true, value: "" });
  if (children.length === 1 && isExactElement(children[0], "br")) {
    if (!consumeNodes(budget, 1)) {
      return paragraphFailure("clipboard.html.resource_limit");
    }
    return children[0].childNodes.length === 0
      ? Object.freeze({ ok: true, value: "" })
      : paragraphFailure("clipboard.html.unsupported_structure");
  }

  const chunks: string[] = [];
  let previousFormats: string | undefined;
  for (const child of children) {
    const run = admitInlineRun(child, budget, inlineAdmission);
    if (!run.ok) return run;
    if (previousFormats === run.formatKey) {
      return paragraphFailure("clipboard.html.unsupported_structure");
    }
    previousFormats = run.formatKey;
    chunks.push(run.text);
  }
  return Object.freeze({ ok: true, value: chunks.join("") });
}

function admitInlineRun(
  node: ChildNode,
  budget: AdmissionBudget,
  inlineAdmission: InlineAdmission,
):
  | Readonly<{ ok: true; text: string; formatKey: string }>
  | Readonly<{ ok: false; code: ClipboardHtmlErrorCode }> {
  let current: ChildNode = node;
  let priorOrder = -1;
  const formats: string[] = [];
  while (!isTextNode(current)) {
    if (!consumeNodes(budget, 1)) {
      return Object.freeze({ ok: false, code: "clipboard.html.resource_limit" });
    }
    if (!isHtmlElement(current)) {
      return Object.freeze({
        ok: false,
        code: "clipboard.html.unsupported_structure",
      });
    }
    const wrapper = wrapperAdmission(current, inlineAdmission);
    if (
      wrapper === undefined ||
      wrapper.order <= priorOrder ||
      current.childNodes.length !== 1
    ) {
      return Object.freeze({
        ok: false,
        code: "clipboard.html.unsupported_structure",
      });
    }
    if (formats.length >= inlineAdmission.maximumFormatsPerRun) {
      return Object.freeze({ ok: false, code: "clipboard.html.resource_limit" });
    }
    formats.push(wrapperFormatKey(current, wrapper));
    priorOrder = wrapper.order;
    const child = current.childNodes[0];
    if (child === undefined) {
      return Object.freeze({
        ok: false,
        code: "clipboard.html.unsupported_structure",
      });
    }
    current = child;
  }

  if (!consumeNodes(budget, 1)) {
    return Object.freeze({ ok: false, code: "clipboard.html.resource_limit" });
  }
  return validText(current)
    ? Object.freeze({
        ok: true,
        text: current.value,
        formatKey: formats.join("\u0000"),
      })
    : Object.freeze({
        ok: false,
        code: "clipboard.html.unsupported_structure",
      });
}

function createInlineAdmission(
  presentation: BrowserCompiledPresentation | undefined,
): InlineAdmission | null {
  if (presentation === undefined) {
    const strong = Object.freeze({ formatKind: "breditor/strong", order: 0 });
    return Object.freeze({
      maximumFormatsPerRun: 1,
      wrappersBySignature: new Map<string, InlineWrapperAdmission>([
        ["strong\u0000", strong],
        ["b\u0000", strong],
      ]),
    });
  }
  if (!isOwnedBrowserCompiledPresentation(presentation)) return null;
  const wrappersBySignature = new Map<string, InlineWrapperAdmission>();
  for (
    let order = 0;
    order < presentation.recipesOuterToInner.length;
    order += 1
  ) {
    const recipe = presentation.recipesOuterToInner[order];
    if (recipe === undefined) return null;
    const signature = `${recipe.element}\u0000${recipe.classes.join(" ")}`;
    if (wrappersBySignature.has(signature)) return null;
    wrappersBySignature.set(
      signature,
      Object.freeze({ formatKind: recipe.formatKind, order, recipe }),
    );
  }
  return Object.freeze({
    maximumFormatsPerRun: Math.min(
      MAX_CLIPBOARD_HTML_FORMATS_PER_RUN,
      presentation.recipesOuterToInner.length,
    ),
    wrappersBySignature,
  });
}

function wrapperAdmission(
  node: ChildNode,
  inlineAdmission: InlineAdmission,
): InlineWrapperAdmission | undefined {
  if (!isHtmlElement(node)) return undefined;
  const classValue = canonicalClassPrefixValue(node);
  if (classValue === null) return undefined;
  const admission = inlineAdmission.wrappersBySignature.get(
    `${node.tagName}\u0000${classValue}`,
  );
  if (admission === undefined) return undefined;
  if (admission.recipe === undefined) {
    return node.attrs.length === 0 ? admission : undefined;
  }
  return wrapperAttributesMatchRecipe(node, admission.recipe)
    ? admission
    : undefined;
}

function wrapperFormatKey(
  node: Element,
  admission: InlineWrapperAdmission,
): string {
  const recipe = admission.recipe;
  if (recipe?.attributes === undefined) return admission.formatKind;
  const offset = recipe.classes.length === 0 ? 0 : 1;
  const dynamic = node.attrs.slice(offset).map(
    ({ name, value }) => `${name}\u0002${value}`,
  ).join("\u0003");
  return `${admission.formatKind}\u0001${dynamic}`;
}

function canonicalClassPrefixValue(node: Element): string | null {
  if (node.attrs.length === 0) return "";
  const attribute = node.attrs[0];
  if (attribute === undefined) return null;
  return attribute.name === "class" &&
      attribute.prefix === undefined &&
      attribute.namespace === undefined
    ? attribute.value
    : "";
}

function wrapperAttributesMatchRecipe(
  node: Element,
  recipe: InlineFormatRenderRecipe,
): boolean {
  const offset = recipe.classes.length === 0 ? 0 : 1;
  if (
    offset === 1 &&
    (node.attrs[0]?.name !== "class" ||
      node.attrs[0]?.prefix !== undefined ||
      node.attrs[0]?.namespace !== undefined ||
      node.attrs[0]?.value !== recipe.classes.join(" "))
  ) {
    return false;
  }
  const attributes: InlineFormatRenderAttribute[] = [];
  for (let index = offset; index < node.attrs.length; index += 1) {
    const attribute = node.attrs[index];
    if (
      attribute === undefined ||
      (attribute.name !== "href" &&
        attribute.name !== "rel" &&
        attribute.name !== "style" &&
        attribute.name !== "target") ||
      attribute.prefix !== undefined ||
      attribute.namespace !== undefined
    ) {
      return false;
    }
    attributes.push({ name: attribute.name, value: attribute.value });
  }
  return recipe.attributes === undefined
    ? attributes.length === 0 && node.attrs.length === offset
    : inlineFormatRenderAttributesAreCanonicalForPolicy(
      recipe.attributes,
      attributes,
    );
}

function isExactElement(node: ChildNode | undefined, tagName: string): node is Element {
  return (
    isHtmlElement(node) &&
    node.nodeName === tagName &&
    node.tagName === tagName &&
    node.attrs.length === 0
  );
}

function isHtmlElement(node: ChildNode | undefined): node is Element {
  return node !== undefined &&
    "tagName" in node &&
    typeof node.tagName === "string" &&
    node.nodeName === node.tagName &&
    node.namespaceURI === HTML_NAMESPACE;
}

function isCommentNode(
  node: ChildNode | undefined,
): node is DefaultTreeAdapterTypes.CommentNode {
  return node !== undefined && node.nodeName === "#comment" && "data" in node;
}

function isTextNode(node: ChildNode | undefined): node is TextNode {
  return node !== undefined && node.nodeName === "#text" && "value" in node;
}

function validText(node: TextNode): boolean {
  return node.value.length > 0 && unicodeScalarUtf8Length(node.value) !== null;
}

function consumeNodes(budget: AdmissionBudget, count: number): boolean {
  budget.nodes += count;
  return budget.nodes <= MAX_CLIPBOARD_HTML_NODES;
}

function normalizedParagraphCount(value: string): number {
  let count = 1;
  for (let index = 0; index < value.length; index += 1) {
    const current = value.charCodeAt(index);
    if (current === 0x0d) {
      count += 1;
      if (value.charCodeAt(index + 1) === 0x0a) index += 1;
    } else if (current === 0x0a) {
      count += 1;
    }
  }
  return count;
}

function characterCount(value: string, codeUnit: number): number {
  let count = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) === codeUnit) count += 1;
  }
  return count;
}

function unicodeScalarUtf8Length(text: string): number | null {
  let bytes = 0;
  for (let index = 0; index < text.length; index += 1) {
    const first = text.charCodeAt(index);
    if (first <= 0x7f) {
      bytes += 1;
    } else if (first <= 0x7ff) {
      bytes += 2;
    } else if (first >= 0xd800 && first <= 0xdbff) {
      const second = text.charCodeAt(index + 1);
      if (!(second >= 0xdc00 && second <= 0xdfff)) return null;
      bytes += 4;
      index += 1;
    } else if (first >= 0xdc00 && first <= 0xdfff) {
      return null;
    } else {
      bytes += 3;
    }
    if (bytes > MAX_CLIPBOARD_HTML_SOURCE_UTF8) return bytes;
  }
  return bytes;
}

function paragraphFailure(code: ClipboardHtmlErrorCode): ParagraphResult {
  return Object.freeze({ ok: false, code });
}

function failure(code: ClipboardHtmlErrorCode): ClipboardHtmlParseResult {
  return Object.freeze({
    ok: false,
    error: Object.freeze({ code, message: ERROR_MESSAGES[code] }),
  });
}
