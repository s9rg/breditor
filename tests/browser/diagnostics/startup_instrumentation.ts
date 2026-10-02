import { createHash } from "node:crypto";
import { parseSync, type ESTree } from "rolldown/utils";

const scopes = {
  wasm_engine_bootstrap: {
    label: "bootstrap",
    functions: ["readSource", "readSemanticProfile", "wellFormedUtf8Length"],
  },
  wasm_session_checkpoint: {
    label: "checkpoint",
    functions: ["sessionCheckpointJsonUtf8Bytes", "validateCheckpointEnvelope", "wellFormedUtf8Length"],
  },
  wasm_document_json: {
    label: "document",
    functions: ["documentJsonUtf8Bytes", "resolveWasmDurableJsonContract", "validDocument", "summarizeDurableFormatRecords", "wellFormedUtf8Length"],
  },
  wasm_profile_descriptor: {
    label: "descriptor",
    functions: ["readDescriptor", "readFormats", "readFormatProperties", "readFormatPropertyValueType", "readIntents", "readActionStates", "readInlineFormatSets", "readInputContract", "readStateContract", "readStateSource"],
  },
  wasm_selection_adapter: {
    label: "selection",
    functions: ["readSemanticSelection", "readPoint", "pointInputAtPreorderIndex", "pathAtPreorderIndex"],
  },
} as const;

export interface StartupRejectionSite {
  readonly stage: string;
  readonly module: string;
  readonly function: string;
  readonly line: number;
  readonly column: number;
}

/** Inserts calls only on existing rejection edges, never into predicates/getters. */
export function instrumentStartupModule(code: string, id: string, recorderImport: string) {
  const module = Object.keys(scopes).find((name) => id.endsWith(`/breditor-browser/dist/${name}.js`)) as keyof typeof scopes | undefined;
  if (module === undefined) return null;
  const moduleName: string = module;
  if (code.includes("__breditorStartupRejection")) throw new Error("Startup diagnostic already installed");
  const policy = scopes[module];
  const parsed = parseSync(id, code);
  if (parsed.errors.length > 0) throw new Error(`Cannot parse startup diagnostic module ${module}`);
  const edits: { start: number; end: number; text: string }[] = [];
  const sites: StartupRejectionSite[] = [];
  let requestSites = 0;

  function sourceText(node: ESTree.Node) { return code.slice(node.start, node.end); }

  function capture(expression: ESTree.Node, scope: string, counters: boolean) {
    const start = expression.start;
    const line = code.slice(0, start).split("\n").length;
    const column = start - code.lastIndexOf("\n", start - 1);
    const stage = `${policy.label}:${scope}:${line}`;
    sites.push({ stage, module: moduleName, function: scope, line, column });
    let detail = counters ? ', { index, bytes, maximum, length: value.length }' : "";
    if (scope === "readFormatPropertyValueType") {
      // Only locals already read by the original code; never invoke a getter again.
      // Type tags: 0 absent, 1 number, 2 other. Kind tags: 1 boolean, 2 integer,
      // 3 string, 0 other. Unknown values themselves are never retained.
      const bounds = ["integerMinimum", "integerMaximum", "stringMinimum", "stringMaximum"];
      detail = `, { kindTag: kind === "boolean" ? 1 : kind === "integer" ? 2 : kind === "string" ? 3 : 0, ${bounds.map((name) =>
        `${name}, ${name}Type: ${name} === undefined ? 0 : typeof ${name} === "number" ? 1 : 2`).join(", ")} }`;
    }
    if (scope === "readPoint") {
      detail = ', { nodeIndex, offset, nodeIndexType: nodeIndex === undefined ? 0 : typeof nodeIndex === "number" ? 1 : 2, offsetType: offset === undefined ? 0 : typeof offset === "number" ? 1 : 2, pointKindTag: kind === "text" ? 1 : kind === "children" ? 2 : 0, affinityTag: affinity === "before" ? 1 : affinity === "after" ? 2 : 0 }';
    }
    if (scope === "pointInputAtPreorderIndex") detail = ', { nodeIndex: point.nodeIndex, offset: point.offset }';
    if (scope === "pathAtPreorderIndex") {
      detail = ', { requestedIndex, nodeIndex, expectedKindTag: expectedKind === "text" ? 1 : expectedKind === "children" ? 2 : 0 }';
    }
    if (scope === "readActionStates") detail = ', { index, count }';
    if (scope === "readInputContract") {
      detail = ', { kindTag: kind === "none" ? 1 : kind === "typed" ? 2 : 0, version, versionType: version === undefined ? 0 : typeof version === "number" ? 1 : 2, nameType: name === undefined ? 0 : typeof name === "string" ? 1 : 2, nameQualifiedRecheck: isQualifiedName(name) ? 1 : 0, versionValidRecheck: isPositiveU32(version) ? 1 : 0 }';
    }
    if (scope === "readStateContract") {
      detail = ', { activationTag: activation === "stateless" ? 1 : activation === "tracked" ? 2 : 0, version: valueVersion, versionType: valueVersion === undefined ? 0 : typeof valueVersion === "number" ? 1 : 2, nameType: valueName === undefined ? 0 : typeof valueName === "string" ? 1 : 2, nameQualifiedRecheck: isQualifiedName(valueName) ? 1 : 0, versionValidRecheck: isPositiveU32(valueVersion) ? 1 : 0 }';
    }
    if (scope === "readStateSource") {
      detail = ', { sourceKindTag: kind === "direct" ? 1 : kind === "routed" ? 2 : kind === "history" ? 3 : 0, actionNameType: actionId === undefined ? 0 : typeof actionId === "string" ? 1 : 2, intentNameType: intentId === undefined ? 0 : typeof intentId === "string" ? 1 : 2, directionTag: direction === undefined ? 0 : direction === "undo" ? 1 : direction === "redo" ? 2 : 3, actionQualifiedRecheck: isQualifiedName(actionId) ? 1 : 0, intentQualifiedRecheck: isQualifiedName(intentId) ? 1 : 0 }';
    }
    edits.push({ start, end: expression.end,
      text: `(__breditorStartupRejection(${JSON.stringify(stage)}${detail}), ${sourceText(expression)})` });
  }

  function visit(node: ESTree.Node, scope: string | null): void {
    if (node.type === "FunctionDeclaration") scope = node.id?.name ?? null;
    else if (node.type === "FunctionExpression" || node.type === "ArrowFunctionExpression") scope = null;
    if (scope !== null && node.type === "CallExpression" && sourceText(node.callee) === "failure" &&
        node.arguments.length === 1 && sourceText(node.arguments[0]!) === "INVALID_REQUEST") {
      requestSites += 1;
      capture(node, scope, false);
      return;
    }
    if (module === "wasm_selection_adapter" && scope === "readSemanticSelection" &&
        node.type === "CallExpression" && sourceText(node.callee) === "selectionFailure") {
      capture(node, scope, false);
      return;
    }
    if (scope !== null && node.type === "ReturnStatement" && node.argument !== null) {
      const expression = node.argument;
      if (["readFormatPropertyValueType", "pathAtPreorderIndex", "readInputContract", "readStateSource"].includes(scope) && expression.type === "ConditionalExpression" &&
          expression.alternate.type === "Literal" && expression.alternate.value === null) {
        capture(expression.alternate, scope, false);
        return;
      }
      const rejected = (expression.type === "Literal" && (expression.value === null || expression.value === false)) ||
        sourceText(expression) === "descriptorFailure()";
      if (((policy.functions as readonly string[]).includes(scope) && rejected) ||
          (scope === "consumeCompiledProfile" && expression.type === "ObjectExpression" &&
            expression.properties.some((property) => property.type === "Property" &&
              sourceText(property.key) === "error" && sourceText(property.value) === "INVALID_REQUEST"))) {
        capture(expression, scope, scope === "wellFormedUtf8Length");
        return;
      }
    }
    // Walk only parser-produced nodes; metadata and literal values are not children.
    for (const value of Object.values(node)) {
      for (const child of Array.isArray(value) ? value : [value]) {
        if (child !== null && typeof child === "object" && "type" in child &&
            "start" in child && "end" in child) visit(child as ESTree.Node, scope);
      }
    }
  }
  visit(parsed.program, null);
  if (module === "wasm_engine_bootstrap" && requestSites !== 2) {
    throw new Error(`Bootstrap request diagnostic drift: expected 2 sites, found ${requestSites}`);
  }
  if (sites.length === 0) throw new Error(`No named rejection sites found in ${module}`);
  let transformed = code;
  for (const edit of edits.sort((left, right) => right.start - left.start)) {
    transformed = transformed.slice(0, edit.start) + edit.text + transformed.slice(edit.end);
  }
  return {
    code: `import { recordStartupRejection as __breditorStartupRejection } from ${JSON.stringify(recorderImport)};\n${transformed}`,
    sourceSha256: createHash("sha256").update(code).digest("hex"),
    sites,
  };
}
