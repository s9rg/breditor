// Runs only as an opt-in Playwright init script in synthetic local fixtures.
// Unlike catch-site rewriting this does not alter the application bundle. It
// still changes the page environment and is not normal performance evidence.
export function installExceptionConstructorProbe() {
  const records = [];
  let dropped = 0;
  const ownDescriptor = Object.getOwnPropertyDescriptor;
  const define = Object.defineProperty;
  const construct = Reflect.construct;
  const slice = String.prototype.slice;
  const apply = Reflect.apply;
  const bounded = (value, maximum) => typeof value === "string" ? apply(slice, value, [0, maximum]) : undefined;
  for (const name of ["Error", "TypeError", "RangeError"]) {
    const original = globalThis[name];
    const proxy = new Proxy(original, {
      construct(target, args, newTarget) {
        const error = construct(target, args, newTarget);
        try {
          const message = ownDescriptor(error, "message");
          // Newly constructed native Error objects only; no thrown arbitrary
          // payload, document snapshot, engine handle or recursive serialization.
          const record = {constructor: name, message: bounded(message?.value, 1024), stack: bounded(error.stack, 4096)};
          if (records.length === 32) { records.shift(); dropped++; }
          records.push(record);
        } catch { /* Diagnostic collection cannot replace the exception. */ }
        return error;
      },
    });
    define(globalThis, name, {...ownDescriptor(globalThis, name), value: proxy});
  }
  define(globalThis, "__breditorExceptionProbeSnapshot", {value: () => ({
    records: records.map(record => ({...record})), dropped,
  }), configurable: false, enumerable: false, writable: false});
}
