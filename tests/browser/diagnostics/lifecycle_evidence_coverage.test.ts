import { readFileSync } from "node:fs";
import { parseSync, type ESTree } from "rolldown/utils";
import { expect, it } from "vitest";

// The mixed reproduction uses these five suites. A configured recorder alone
// is insufficient: the suite must actually await its attachment after the test.
it.each([
  ["editor.spec.ts", "attachConfiguredLinkFaults"],
  ["clipboard-boundary.spec.ts", "attachConfiguredLinkFaults"],
  ["clipboard-lifecycle.spec.ts", "attachLinkFaults"],
  ["formatted-clipboard-lifecycle.spec.ts", "attachLinkFaults"],
  ["link-history-lifecycle.spec.ts", "attachLinkFaults"],
])("%s retains the mixed-run diagnostic evidence", (file, helper) => {
  const source = parseSync(file, readFileSync(new URL(`../${file}`, import.meta.url), "utf8"));
  expect(source.errors).toEqual([]);
  let attachments = 0;
  function children(node: ESTree.Node, visit: (child: ESTree.Node) => void): void {
    for (const value of Object.values(node)) for (const child of Array.isArray(value) ? value : [value]) {
      if (child !== null && typeof child === "object" && "type" in child && "start" in child && "end" in child) {
        visit(child as ESTree.Node);
      }
    }
  }
  function inspectHook(node: ESTree.Node): void {
    if (node.type === "AwaitExpression" && node.argument.type === "CallExpression" &&
        node.argument.callee.type === "Identifier" && node.argument.callee.name === helper) {
      attachments++;
    }
    children(node, inspectHook);
  }
  function visit(node: ESTree.Node): void {
    if (node.type === "CallExpression" && node.callee.type === "MemberExpression" &&
        node.callee.object.type === "Identifier" && node.callee.object.name === "test" &&
        node.callee.property.type === "Identifier" && node.callee.property.name === "afterEach") {
      for (const argument of node.arguments) inspectHook(argument);
    }
    children(node, visit);
  }
  visit(source.program);
  expect(attachments, "one awaited evidence attachment per test").toBe(1);
});
