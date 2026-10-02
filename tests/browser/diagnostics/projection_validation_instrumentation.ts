import { createHash } from "node:crypto";
import { parseSync, type ESTree } from "rolldown/utils";

/** Test build only: observe existing projection validator rejection returns.
 * No successful predicate is wrapped, and no projection payload is recorded.
 */
export function instrumentProjectionValidation(code: string, id: string, recorder: string,
  options: { requiredProperty?: boolean } = {}) {
  if (!id.endsWith("/breditor-browser/dist/projection.js")) return null;
  if (code.includes("__breditorProjectionReject")) throw new Error("Projection validation diagnostic already installed");
  const parsed = parseSync(id, code);
  if (parsed.errors.length) throw new Error("Cannot parse projection validation module");
  const edits: { start: number; end: number; text: string }[] = [];
  const sites: { stage: string; line: number; function: string }[] = [];
  let requiredSites = 0;
  function visit(node: ESTree.Node, functionName = "<method>"): void {
    if (node.type === "FunctionDeclaration") functionName = node.id?.name ?? "<anonymous>";
    if (options.requiredProperty && functionName === "validateFormatDetails" && node.type === "WhileStatement" &&
        code.slice(node.test.start, node.test.end) === "contractIndex < formatContract.properties.length") {
      const check = node.body.type === "BlockStatement" && node.body.body.length === 2 &&
        code.slice(node.body.body[1]!.start, node.body.body[1]!.end) === "contractIndex += 1;" ? node.body.body[0] : undefined;
      if (check?.type !== "IfStatement" || check.consequent.type !== "ReturnStatement" ||
          check.consequent.argument?.type !== "Literal" || check.consequent.argument.value !== null ||
          code.slice(check.test.start, check.test.end) !== 'formatContract.properties[contractIndex]?.presence === "required"') {
        throw new Error("Required projection property rejection shape drift");
      }
      const value = check.consequent.argument;
      const line = code.slice(0, value.start).split("\n").length;
      const stage = `projection:reject:${line}`;
      requiredSites++;
      sites.push({ stage, line, function: functionName });
      edits.push({ start: value.start, end: value.end,
        text: `__breditorRequiredProperty(${JSON.stringify(stage)}, (${code.slice(value.start, value.end)}), format, contractIndex, formatContract, propertyArray, properties)` });
      return;
    }
    if (node.type === "ReturnStatement" && node.argument) {
      const value = node.argument;
      const rejects = (value.type === "Literal" && value.value === null) ||
        (value.type === "CallExpression" && value.callee.type === "Identifier" &&
          ["projectionFailure", "validationFailure"].includes(value.callee.name)) ||
        (functionName !== "validationFailure" && value.type === "ObjectExpression" && value.properties.some(property =>
          property.type === "Property" && property.key.type === "Identifier" && property.key.name === "ok" &&
          property.value.type === "Literal" && property.value.value === false));
      if (rejects) {
        const line = code.slice(0, value.start).split("\n").length;
        const stage = `projection:reject:${line}`;
        sites.push({ stage, line, function: functionName });
        edits.push({ start: value.start, end: value.end,
          text: `__breditorProjectionReject(${JSON.stringify(stage)}, (${code.slice(value.start, value.end)}))` });
        return;
      }
    }
    for (const value of Object.values(node)) for (const child of Array.isArray(value) ? value : [value]) {
      if (child !== null && typeof child === "object" && "type" in child && "start" in child && "end" in child) {
        visit(child as ESTree.Node, functionName);
      }
    }
  }
  visit(parsed.program);
  if (options.requiredProperty && requiredSites !== 1) throw new Error("Expected one trailing required-property rejection");
  if (sites.length === 0) throw new Error("No projection validator rejections found");
  let transformed = code;
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    transformed = transformed.slice(0, edit.start) + edit.text + transformed.slice(edit.end);
  }
  return { sourceSha256: createHash("sha256").update(code).digest("hex"), sites,
    code: `import { recordLinkThrow as __breditorProjectionReject, recordRequiredProperty as __breditorRequiredProperty } from ${JSON.stringify(recorder)};\n${transformed}` };
}
