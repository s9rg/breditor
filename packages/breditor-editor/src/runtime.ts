import {runtimeLoader} from "./runtime_loader.js";
import type {RichWasmModule} from "@breditor/experimental-rich-content";
import type {RuntimeInput} from "./runtime_loader.js";
/** Initializes only the packaged local module. No React, replication engine or relay import. */
const load=runtimeLoader(()=>import("@breditor/experimental-rich-content/wasm"));
export function initializeLocalRuntime(input?:RuntimeInput):Promise<RichWasmModule>{return load(input);}
export type {RuntimeInput} from "./runtime_loader.js";
