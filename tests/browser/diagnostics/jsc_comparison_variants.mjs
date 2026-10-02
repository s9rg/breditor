import { createHash } from "node:crypto";

export const originalComparisonSha256 = "bb0387bfa73e13eec77611ca9b8cfcb70cbbd51f8f99a18d066ca2ceb88f277b";
export const comparisonVariants = ["original", "captured", "strict", "same-value-js", "result-only"];
export const sameValueExpression = "(actual===expected ? actual!==0 || 1/actual===1/expected : actual!==actual && expected!==expected)";
const original = "function c(e,t,n){let r=o[n],i=0;for(let t=0;t<r.length;t++)Object.is(e[t],r[t])||(i|=1<<t);i!==0&&s(e,r,t,n,i)}";

/** Exact-bundle diagnostic transformation, never imported by production code.
 * Captures the comparison's returned boolean and the values loaded ONCE by
 * that iteration. Captures are cold-path observations, not machine snapshots.
 * All variants retain the original throw and expected arrays. Even a green
 * variant is not a fix: instrumentation changes compilation and allocation.
 */
export function transformJscComparison(code, variant) {
  if (!comparisonVariants.includes(variant)) throw new Error("Unknown comparison variant");
  if (createHash("sha256").update(code).digest("hex") !== originalComparisonSha256) throw new Error("Original comparison bundle drift");
  if (variant === "original") return code;
  if (code.split(original).length !== 2) throw new Error("Comparison function drift");
  return code.replace(original, capturedComparisonFunction(variant));
}

/** Exposed for oracle tests without requiring ignored build artifacts. */
export function capturedComparisonFunction(variant) {
  // Minimal extra local, preserving the original operand loads and short-
  // circuit branch. This captures only the LAST field's returned boolean;
  // interpret it only alongside the mismatch mask and reference length.
  if (variant === "result-only") return "function c(e,t,n){let r=o[n],i=0,result;for(let t=0;t<r.length;t++)(result=Object.is(e[t],r[t]))||(i|=1<<t);i!==0&&(globalThis.breditorHotComparison={lastComparisonResult:result,lastField:r.length-1,maskAfter:i},s(e,r,t,n,i))}";
  if (!["captured", "strict", "same-value-js"].includes(variant)) throw new Error("Unknown captured comparison variant");
  const compare = variant === "strict" ? "actual===expected" : variant === "same-value-js"
    ? sameValueExpression
    : "Object.is(actual,expected)";
  return `function c(e,t,n){
    let r=o[n],i=0;
    for(let field=0;field<r.length;field++){
      const actual=e[field],expected=r[field],equal=${compare};
      if(!equal){
        const before=i;
        i|=1<<field;
        globalThis.breditorHotComparison={iteration:t,propertyIndex:n,field,actual,expected,
          equal,maskBefore:before,maskAfter:i,strictEqual:actual===expected,
          objectIsAgain:Object.is(actual,expected),actualType:typeof actual,expectedType:typeof expected};
      }
    }
    i!==0&&s(e,r,t,n,i)
  }`;
}
