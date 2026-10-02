export const jscTierModes = ["normal", "no-ftl", "baseline", "no-jit"] as const;
export type JscTierMode = typeof jscTierModes[number];

/** Diagnostic child-process options only; never modifies browser preferences. */
export function jscTierEnvironment(mode: string, inherited: Record<string, string | undefined>, logCompilation = false) {
  if (!(jscTierModes as readonly string[]).includes(mode)) throw new Error("Unknown JSC tier control");
  // Do not accidentally inherit another experiment's JSC overrides.
  const env: Record<string, string> = Object.fromEntries(Object.entries(inherited)
    .filter((entry): entry is [string, string] => entry[1] !== undefined && !entry[0].startsWith("JSC_") && !entry[0].startsWith("__XPC_JSC_")));
  const options: Record<string, string> = { dumpOptions: "1", useJIT: mode === "no-jit" ? "false" : "true" };
  if (mode === "no-ftl" || mode === "baseline") options["useFTLJIT"] = "false";
  if (mode === "baseline") options["useDFGJIT"] = "false";
  if (logCompilation) options["logJIT"] = "true";
  for (const [key, value] of Object.entries(options)) {
    env[`JSC_${key}`] = value;
    env[`__XPC_JSC_${key}`] = value;
  }
  return env;
}
