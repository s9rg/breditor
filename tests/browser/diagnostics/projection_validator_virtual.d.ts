declare module "virtual:breditor-projection-validator" {
  export function diagnosticValidateFormatDetails(input: unknown, admitted: unknown): null | {
    formatDetails: readonly { properties: readonly { name: string; value: unknown }[] }[];
  };
}
