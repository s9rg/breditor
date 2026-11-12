/** Fixtures use a pinned build receipt when launched by candidate qualification.
 * Direct historical checks retain their original normal application Wasm pin. */
import {fileURLToPath} from "node:url";
import {historicalSharedWasmSha256, pinnedSharedRuntimeReceipt, sharedRuntimeReceiptVariable} from "./shared-runtime-receipt.mjs";

const receiptSha256 = process.env[sharedRuntimeReceiptVariable];
export const NORMAL_SHARED_WASM_SHA256 = receiptSha256 === undefined ? historicalSharedWasmSha256 :
 pinnedSharedRuntimeReceipt(fileURLToPath(new URL("../../../", import.meta.url)), receiptSha256).wasmSha256;
