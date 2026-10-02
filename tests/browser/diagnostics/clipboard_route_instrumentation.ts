import { createHash } from "node:crypto";
import { parseSync, type ESTree } from "rolldown/utils";

/** Observe the existing disposition once, before the router consumes it. */
export function instrumentClipboardRoutes(code: string, id: string, recorder: string) {
  if (!id.endsWith("/breditor-browser/dist/browser_event_router.js")) return null;
  if (code.includes("__breditorClipboardRoute")) throw new Error("Clipboard diagnostic already installed");
  const parsed = parseSync(id, code);
  if (parsed.errors.length) throw new Error("Cannot parse clipboard router diagnostic");
  const offsets: number[] = [];
  function visit(node: ESTree.Node): void {
    if (node.type === "MethodDefinition" && node.key.type === "PrivateIdentifier" && node.key.name === "afterClipboard") {
      if (!node.value.body || node.value.params.length !== 2 ||
          node.value.params[0]?.type !== "Identifier" || node.value.params[0].name !== "disposition" ||
          node.value.params[1]?.type !== "Identifier" || node.value.params[1].name !== "route") throw new Error("Clipboard route shape drift");
      offsets.push(node.value.body.start + 1);
    }
    for (const value of Object.values(node)) for (const child of Array.isArray(value) ? value : [value]) {
      if (child !== null && typeof child === "object" && "type" in child && "start" in child && "end" in child) visit(child as ESTree.Node);
    }
  }
  visit(parsed.program);
  if (offsets.length !== 1) throw new Error("Expected one clipboard route consumer");
  const offset = offsets[0]!;
  const stage = `browser_event_router:clipboard:${code.slice(0, offset).split("\n").length}`;
  return { sourceSha256: createHash("sha256").update(code).digest("hex"), sites: [{ stage }],
    code: `import { recordClipboardRoute as __breditorClipboardRoute } from ${JSON.stringify(recorder)};\n${code.slice(0, offset)}\n__breditorClipboardRoute(disposition, route);${code.slice(offset)}` };
}
