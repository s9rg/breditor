import { createHash } from "node:crypto";
import { parseSync } from "rolldown/utils";

/** Isolated test build only: expose the actual validator without rewriting its body. */
export function exposeProjectionValidator(code: string, id: string) {
  if (!id.endsWith("/breditor-browser/dist/projection.js")) return null;
  const parsed = parseSync(id, code);
  if (parsed.errors.length || !parsed.program.body.some(node =>
    node.type === "FunctionDeclaration" && node.id?.name === "validateFormatDetails")) {
    throw new Error("Projection validator export source drift");
  }
  const suffix = "\nexport { validateFormatDetails as diagnosticValidateFormatDetails };\n";
  if (code.includes("diagnosticValidateFormatDetails")) throw new Error("Projection validator already exposed");
  return { code: code + suffix, sourceSha256: createHash("sha256").update(code).digest("hex"), suffix };
}
