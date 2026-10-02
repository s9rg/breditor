/** Test-build-only, payload-free rejection breadcrumbs. Never imported by packages. */
export function createStartupDiagnosticRecorder() {
  const limit = 16;
  let events: Readonly<{ stage: string; counters: Readonly<Record<string, string>> }>[] | undefined;
  let omitted = 0;

  function record(stage: string, counters?: unknown): void {
    // Diagnostics must never replace the rejection they are observing.
    try {
      if (typeof stage !== "string" || stage.length > 160 ||
          !/^(bootstrap|checkpoint|document|descriptor|selection):[A-Za-z0-9_]+:[0-9]+$/u.test(stage)) return;
      if (events?.length === limit) {
        if (omitted < 1_000_000) omitted += 1;
        return;
      }
      const captured: Record<string, string> = Object.create(null) as Record<string, string>;
      if (typeof counters === "object" && counters !== null) {
        for (const key of ["index", "length", "bytes", "maximum", "kindTag",
          "integerMinimum", "integerMaximum", "stringMinimum", "stringMaximum",
          "integerMinimumType", "integerMaximumType", "stringMinimumType", "stringMaximumType",
          "nodeIndex", "offset", "requestedIndex", "nodeIndexType", "offsetType",
          "pointKindTag", "affinityTag", "expectedKindTag", "iteration", "propertyIndex", "mismatchMask", "count",
          "version", "versionType", "nameType", "nameQualifiedRecheck", "versionValidRecheck", "activationTag",
          "sourceKindTag", "actionNameType", "intentNameType", "directionTag", "actionQualifiedRecheck", "intentQualifiedRecheck",
          "field", "actual", "expected", "actualType", "expectedType", "objectIsRecheck", "strictEqualRecheck",
          "actualHigh", "actualLow", "expectedHigh", "expectedLow"] as const) {
          const property = Object.getOwnPropertyDescriptor(counters, key);
          if (property !== undefined && "value" in property && typeof property.value === "number") {
            captured[key] = Object.is(property.value, -0) ? "-0" : String(property.value);
          }
        }
      }
      (events ??= []).push(Object.freeze({ stage, counters: Object.freeze(captured) }));
    } catch {
      // Retain the application's original failure even if recording fails.
    }
  }

  function snapshot() {
    return Object.freeze({
      format: "breditor/startup-rejections" as const,
      version: 1 as const,
      limit,
      omitted,
      events: Object.freeze([...(events ?? [])]),
    });
  }
  return Object.freeze({ record, snapshot });
}

const recorder = createStartupDiagnosticRecorder();
export const recordStartupRejection = recorder.record;
export const readStartupRejections = recorder.snapshot;
