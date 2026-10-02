export type ComparisonVariant = "original" | "captured" | "strict" | "same-value-js" | "result-only";
export const originalComparisonSha256: string;
export const comparisonVariants: readonly ComparisonVariant[];
export const sameValueExpression: string;
export function transformJscComparison(code: string, variant: string): string;
export function capturedComparisonFunction(variant: string): string;
