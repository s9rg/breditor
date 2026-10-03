declare module "virtual:breditor-selection-validator" {
  export function diagnosticIsU32(value: unknown): boolean;
  export function diagnosticReadPoint(kind: unknown, nodeIndex: unknown, offset: unknown, affinity: unknown):
    { kind: "text" | "children"; nodeIndex: number; offset: number; affinity: "before" | "after" } | null;
}
