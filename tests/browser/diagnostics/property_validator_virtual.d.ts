/** Private test-build export only; never part of the browser package API. */
declare module "virtual:breditor-property-validator" {
  export function validateProperty(kind: unknown, integerMinimum: unknown, integerMaximum: unknown,
    stringMinimum: unknown, stringMaximum: unknown): unknown;
}
