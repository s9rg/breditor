/** Explicit proof scopes: a missing historical fixture never silently reduces coverage. */
export function inputRuleProofPolicy(mode="with-historical-references") {
 if(mode!=="with-historical-references"&&mode!=="current-runtime-only")throw new TypeError("Choose an explicit input-rule proof scope");
 const historicalReferences=mode==="with-historical-references";
 return Object.freeze({mode,historicalReferences,expectedStartupRefusals:historicalReferences?8:4,expectedLegacyReplacementRefusals:historicalReferences?1:0,
  deferred:Object.freeze(historicalReferences?[]:["pinned-earlier-runtime-capability-refusal","pinned-programmatic-only-runtime-capability-refusal","pinned-earlier-whole-replacement-reader-refusal"])});
}

/** Full historical proof keeps six required directories. CI must name its narrower scope. */
export function parseInputRuleUiArguments(args) {
 const currentOnly=args[0]==="--current-runtime-only",directories=currentOnly?args.slice(1):args;
 if(directories.length!==(currentOnly?2:6)||directories.some(value=>typeof value!=="string"||!value||value.startsWith("--")))throw new TypeError("Expected six current/earlier/prior SDK runtime directories, or --current-runtime-only followed by current local/shared directories");
 return Object.freeze({policy:inputRuleProofPolicy(currentOnly?"current-runtime-only":"with-historical-references"),directories:Object.freeze([...directories,...(currentOnly?[undefined,undefined,undefined,undefined]:[])])});
}

/** Reusing producers and omitting historical references are independent, recorded choices. */
export function parseInputRuleInstalledArguments(args) {
 if(new Set(args).size!==args.length||args.some(value=>!["--reuse-runtimes","--current-runtime-only"].includes(value)))throw new TypeError("Usage: node scripts/check-input-rules-installed.mjs [--reuse-runtimes] [--current-runtime-only]; never publishes");
 return Object.freeze({reusedRuntimes:args.includes("--reuse-runtimes"),policy:inputRuleProofPolicy(args.includes("--current-runtime-only")?"current-runtime-only":"with-historical-references")});
}
