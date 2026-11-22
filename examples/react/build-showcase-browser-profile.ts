import { minifySync, parseSync, Visitor } from "rolldown/utils";
import type { Plugin } from "vite";

const browserOutput = /\/(?:packages\/breditor-browser|node_modules\/@breditor\/browser)\/dist\/([^/]+\.js)$/u;
const internalBoundaries = /^(wasm_|browser_event_|composition_|dom_renderer|clipboard_controller|editor_command|dom_selection|browser_editor)/u;
const errorConstructors = new Set(["Error", "TypeError", "RangeError"]);

type Edit = Readonly<{ start: number; end: number; replacement: string }>;

/** The showcase opens one immutable paragraph profile. */
export function buildShowcaseBrowserProfile(): Plugin {
  return {
    name: "build-showcase-browser-profile",
    apply: "build",
    enforce: "pre",
    transform(source, id) {
      const file = browserOutput.exec(id.replaceAll("\\", "/"))?.[1];
      if (file === undefined) return;

      const parsed = parseSync(file, source);
      if (parsed.errors.length) this.error(parsed.errors[0]!.message);
      const edits: Edit[] = [];
      const compactInternalErrors = internalBoundaries.test(file);
      new Visitor({
        MemberExpression(node) {
          if (!node.computed && node.object.type === "MetaProperty" &&
            node.object.meta.name === "import" && node.property.type === "Identifier" &&
            node.property.name === "breditorExperimentalBlockProfiles") {
            edits.push({ start: node.start, end: node.end, replacement: "false" });
          }
        },
        ThrowStatement({ argument }) {
          // Internal exceptions are mapped to structured error codes at the
          // browser boundary. Keep the error classes and leave result messages
          // and dynamic or diagnostic cause expressions alone.
          if (!compactInternalErrors ||
            (argument.type !== "NewExpression" && argument.type !== "CallExpression") ||
            argument.callee.type !== "Identifier" || !errorConstructors.has(argument.callee.name) ||
            argument.arguments.length !== 1) return;
          const message = argument.arguments[0];
          if (message?.type === "Literal" && typeof message.value === "string" ||
            message?.type === "TemplateLiteral" && message.expressions.length === 0) {
            edits.push({ start: message.start, end: message.end, replacement: "" });
          }
        },
      }).visit(parsed.program);
      if (edits.length === 0) return;

      let code = source;
      for (const { start, end, replacement } of edits.sort((left, right) => right.start - left.start)) {
        code = code.slice(0, start) + replacement + code.slice(end);
      }
      const result = minifySync(file, code, { module: true, compress: true, mangle: true });
      if (result.errors.length) this.error(result.errors[0]!.message);
      return result.code;
    },
  };
}
