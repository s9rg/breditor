import { createHash } from "node:crypto";
import { parseSync, type ESTree } from "rolldown/utils";

/** Observe only caught queue failures; do not rewrite any executor or predicate. */
export function instrumentQueueFaults(code: string, id: string, recorder: string, mode: "catch" | "stop" = "catch") {
  if (!id.endsWith("/breditor-browser/dist/command_queue.js")) return null;
  if (code.includes("__breditorQueue")) throw new Error("Queue diagnostic already installed");
  const parsed = parseSync(id, code);
  if (parsed.errors.length) throw new Error("Cannot parse queue diagnostic module");
  const sites: { stage: string; line: number }[] = [];
  const edits: { offset: number; text: string }[] = [];
  function children(node: ESTree.Node): ESTree.Node[] {
    return Object.values(node).flatMap(value => Array.isArray(value) ? value : [value])
      .filter(value => value !== null && typeof value === "object" && "type" in value && "start" in value && "end" in value) as ESTree.Node[];
  }
  function failureKind(node: ESTree.Node): "executor" | "observer" | undefined {
    if (node.type === "CallExpression" && node.callee.type === "MemberExpression" &&
        node.callee.property.type === "PrivateIdentifier" && node.callee.property.name === "fail" &&
        node.arguments[0]?.type === "Literal") {
      if (node.arguments[0].value === "command_queue.executor_threw") return "executor";
      if (node.arguments[0].value === "command_queue.observer_threw") return "observer";
    }
    return children(node).map(failureKind).find(kind => kind !== undefined);
  }
  function visit(node: ESTree.Node): void {
    if (mode === "stop" && node.type === "MethodDefinition" &&
        node.key.type === "PrivateIdentifier" && node.key.name === "fail") {
      const parameter = node.value.params[0];
      if (parameter?.type !== "Identifier" || parameter.name !== "code" || !node.value.body) throw new Error("Queue failure method shape drift");
      const line = code.slice(0, node.start).split("\n").length;
      const stage = `command_queue:stop:${line}`;
      sites.push({ stage, line });
      edits.push({ offset: node.value.body.start + 1, text: `\n__breditorQueueFault(${JSON.stringify(stage)}, code);` });
      return;
    }
    if (mode === "catch" && node.type === "CatchClause") {
      const kind = failureKind(node.body);
      if (kind !== undefined) {
        if (node.param !== null || code.slice(node.start, node.start + 5) !== "catch") throw new Error("Queue catch shape drift");
        const line = code.slice(0, node.start).split("\n").length;
        const stage = `command_queue:${kind}:${line}`;
        sites.push({ stage, line });
        edits.push({ offset: node.start + 5, text: " (__breditorQueueError)" },
          { offset: node.body.start + 1, text: `\n__breditorQueueFault(${JSON.stringify(stage)}, __breditorQueueError);` });
        return;
      }
    }
    for (const child of children(node)) visit(child);
  }
  visit(parsed.program);
  const expected = mode === "catch" ? 4 : 1;
  if (sites.length !== expected) throw new Error(`Expected ${mode === "catch" ? "four queue catches" : "one queue failure method"}, found ${sites.length}`);
  let transformed = code;
  for (const edit of edits.sort((a, b) => b.offset - a.offset)) transformed = transformed.slice(0, edit.offset) + edit.text + transformed.slice(edit.offset);
  return { sourceSha256: createHash("sha256").update(code).digest("hex"), sites,
    code: `import { recordQueueFault as __breditorQueueFault } from ${JSON.stringify(recorder)};\n${transformed}` };
}
