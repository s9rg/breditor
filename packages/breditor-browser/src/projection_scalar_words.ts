/** Internal decoder for owned optional-u32 records. Not a public ABI switch. */
const typedArrayPrototype = Object.getPrototypeOf(Uint32Array.prototype) as object;
const lengthGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, "length")!.get!;
const bufferGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, "buffer")!.get!;
const tagGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, Symbol.toStringTag)!.get!;
const arrayBufferLengthGetter = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, "byteLength")!.get!;
const integerFromWords = BigInt;
const signedIntegerFromBits = BigInt.asIntN;
const numberFromInteger = Number;

/**
 * Decode an owned [presence, value] copy exactly once. Neither instanceof nor
 * user-controlled tags establish the brand. Shared backing storage is rejected:
 * generated Rust Vec returns are copies, not concurrently mutable memory leases.
 * Throws on malformed input; callers must fail admission, never retry/fallback.
 */
export function decodeProjectionScalarWords(record: unknown): number | undefined {
  let length: unknown;
  let tag: unknown;
  try {
    length = Reflect.apply(lengthGetter, record, []);
    tag = Reflect.apply(tagGetter, record, []);
    const buffer: unknown = Reflect.apply(bufferGetter, record, []);
    // Native ArrayBuffer brand check also rejects SharedArrayBuffer cross-realm.
    Reflect.apply(arrayBufferLengthGetter, buffer, []);
  } catch {
    throw new TypeError("invalid projection scalar words");
  }
  if (length !== 2 || tag !== "Uint32Array") {
    throw new TypeError("invalid projection scalar words");
  }
  const words = record as Uint32Array;
  const presence = words[0];
  const value = words[1];
  if (presence === 0 && value === 0) return undefined;
  if (presence === 1) return value;
  throw new TypeError("invalid projection scalar words");
}

/** Decode a signed i64 copy, admitting only the exact JavaScript-safe domain. */
export function decodeProjectionIntegerWords(record: unknown): number | undefined {
  let length: unknown;
  let tag: unknown;
  try {
    length = Reflect.apply(lengthGetter, record, []);
    tag = Reflect.apply(tagGetter, record, []);
    const buffer: unknown = Reflect.apply(bufferGetter, record, []);
    Reflect.apply(arrayBufferLengthGetter, buffer, []);
  } catch {
    throw new TypeError("invalid projection integer words");
  }
  if (length !== 3 || tag !== "Uint32Array") throw new TypeError("invalid projection integer words");
  const words = record as Uint32Array;
  const presence = words[0], low = words[1], high = words[2];
  if (presence === 0 && low === 0 && high === 0) return undefined;
  if (presence !== 1 || low === undefined || high === undefined) {
    throw new TypeError("invalid projection integer words");
  }
  const value = signedIntegerFromBits(64, (integerFromWords(high) << 32n) | integerFromWords(low));
  if (value < -9007199254740991n || value > 9007199254740991n) {
    throw new TypeError("projection integer outside safe domain");
  }
  return numberFromInteger(value);
}
