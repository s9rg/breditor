import { diagnosticValidateFormatDetails } from "virtual:breditor-projection-validator";

/** Ordinary JS arrays through the unchanged production property validator.
 * This is a reduction/control, not a reproduction of editor history or Wasm reads.
 */
export function probeProjectionValidator(iterations: number): string {
  if (!Number.isSafeInteger(iterations) || iterations < 1 || iterations > 100_000) throw new Error("invalid probe length");
  const href = "example/href";
  const target = "example/open-in-new-window";
  const kind = "example/link";
  const contract = (presence: "required" | "optional") => new Map([[kind, {
    properties: [
      { name: href, presence: "required", valueType: { kind: "string", minimumUtf8Bytes: 1, maximumUtf8Bytes: 2048 } },
      { name: target, presence, valueType: { kind: "boolean" } },
    ],
  }]]);
  const required = contract("required");
  const optional = contract("optional");
  let checks = 0;
  for (let cycle = 0; cycle < iterations; cycle++) {
    // Alternate false/true and required/optional rather than testing false alone.
    const boolean = cycle % 2 !== 0;
    const properties = [{ name: href, value: "https://example.test/probe" }, { name: target, value: boolean }];
    for (const admitted of [required, optional]) {
      const result = diagnosticValidateFormatDetails([{ kind, properties }], admitted);
      const copied = result?.formatDetails[0]?.properties;
      if (copied?.length !== 2 || copied[0]?.name !== href || copied[0]?.value !== properties[0]?.value ||
          copied[1]?.name !== target || copied[1]?.value !== boolean || copied === properties || !Object.isFrozen(copied)) {
        throw new Error(`projection validator full properties cycle=${cycle} sourceLength=${properties.length} copiedLength=${copied?.length ?? "absent"}`);
      }
      checks++;
    }
    const absent = [{ kind, properties: properties.slice(0, 1) }];
    if (diagnosticValidateFormatDetails(absent, required) !== null) throw new Error(`required omission accepted cycle=${cycle}`);
    const accepted = diagnosticValidateFormatDetails(absent, optional);
    if (accepted?.formatDetails[0]?.properties.length !== 1) throw new Error(`optional omission rejected cycle=${cycle}`);
    if (properties.length !== 2 || properties[1]?.value !== boolean) throw new Error(`source changed cycle=${cycle}`);
    checks += 2;
  }
  return JSON.stringify({ format: "breditor/js-projection-validator", cycles: String(iterations), checks: String(checks) });
}
