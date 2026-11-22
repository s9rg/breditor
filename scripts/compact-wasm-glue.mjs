import { readFileSync, writeFileSync } from "node:fs";

if (process.argv.length !== 3) throw Error("Usage: node compact-wasm-glue.mjs <generated-js>");
const input = process.argv[2];
let source = readFileSync(input, "utf8");
let compactedStrings = 0;

function generatedBody(lines) {
  return new RegExp(lines.join("\\n +"), "g");
}

const invokeOnStack = [
  String.raw`try \{`,
  String.raw`const retptr = wasm\.__wbindgen_add_to_stack_pointer\(-16\);`,
  String.raw`(wasm\.\w+\(retptr[^\n]*\));`,
  String.raw`var r0 = getDataViewMemory0\(\)\.getInt32\(retptr \+ 4 \* 0, true\);`,
  String.raw`var r1 = getDataViewMemory0\(\)\.getInt32\(retptr \+ 4 \* 1, true\);`,
];
const restoreStack = [
  String.raw`\} finally \{`,
  String.raw`wasm\.__wbindgen_add_to_stack_pointer\(16\);`,
];

// Match complete wasm-bindgen 0.2.127 bodies. The callback keeps argument
// evaluation inside the Wasm stack reservation. The helpers preserve each
// return path's deallocation order.
source = source.replace(generatedBody([
  ...invokeOnStack,
  String.raw`let v1;`,
  String.raw`if \(r0 !== 0\) \{`,
  String.raw`v1 = getStringFromWasm0\(r0, r1\);`,
  String.raw`wasm\.__wbindgen_export\(r0, r1 \* 1, 1\);`,
  String.raw`\}`,
  String.raw`return v1;`,
  ...restoreStack,
  String.raw`\}`,
]), (_, invoke) => {
  compactedStrings++;
  return `return readOptionalResultString(retptr => ${invoke});`;
});

source = source.replace(generatedBody([
  String.raw`let deferred1_0;`,
  String.raw`let deferred1_1;`,
  ...invokeOnStack,
  String.raw`deferred1_0 = r0;`,
  String.raw`deferred1_1 = r1;`,
  String.raw`return getStringFromWasm0\(r0, r1\);`,
  ...restoreStack,
  String.raw`wasm\.__wbindgen_export\(deferred1_0, deferred1_1, 1\);`,
  String.raw`\}`,
]), (_, invoke) => {
  compactedStrings++;
  return `return readRequiredResultString(retptr => ${invoke});`;
});

source = source.replace(generatedBody([
  String.raw`const obj = Object\.create\((\w+)\.prototype\);`,
  String.raw`obj\.__wbg_ptr = ptr;`,
  String.raw`(\w+)\.register\(obj, obj\.__wbg_ptr, obj\);`,
  String.raw`return obj;`,
]), (_, type, registry) => `return wrapGeneratedOwner(${type}, ptr, ${registry});`);

source = source.replace(generatedBody([
  String.raw`const ptr = this\.__wbg_ptr;`,
  String.raw`this\.__wbg_ptr = 0;`,
  String.raw`(\w+)\.unregister\(this\);`,
  String.raw`return ptr;`,
]), (_, registry) => `return destroyGeneratedOwner(this, ${registry});`);

if (compactedStrings === 0) throw Error("No recognized generated Wasm string results");
source += `

function wrapGeneratedOwner(type, ptr, registry) {
    const obj = Object.create(type.prototype);
    obj.__wbg_ptr = ptr;
    registry.register(obj, obj.__wbg_ptr, obj);
    return obj;
}

function destroyGeneratedOwner(owner, registry) {
    const ptr = owner.__wbg_ptr;
    owner.__wbg_ptr = 0;
    registry.unregister(owner);
    return ptr;
}

function readOptionalResultString(invoke) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        invoke(retptr);
        const pointer = getDataViewMemory0().getInt32(retptr, true);
        const length = getDataViewMemory0().getInt32(retptr + 4, true);
        if (pointer !== 0) {
            const value = getStringFromWasm0(pointer, length);
            wasm.__wbindgen_export(pointer, length, 1);
            return value;
        }
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

function readRequiredResultString(invoke) {
    let pointer;
    let length;
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        invoke(retptr);
        const nextPointer = getDataViewMemory0().getInt32(retptr, true);
        const nextLength = getDataViewMemory0().getInt32(retptr + 4, true);
        pointer = nextPointer;
        length = nextLength;
        return getStringFromWasm0(pointer, length);
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
        wasm.__wbindgen_export(pointer, length, 1);
    }
}
`;
writeFileSync(input, source);
