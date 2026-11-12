/** Fixtures use a pinned build receipt when launched by candidate qualification.
 * Direct historical checks retain their original normal application Wasm pin. */
import {fileURLToPath} from "node:url";
import {pinnedSharedRuntimeReceipt, sharedRuntimeReceiptVariable} from "./shared-runtime-receipt.mjs";

const legacy = "165e23dbaef2ab77a6f920a20012e19624422ab2ccb74ec4e01f2146ac8086e0";
const receiptSha256 = process.env[sharedRuntimeReceiptVariable];
export const NORMAL_SHARED_WASM_SHA256 = receiptSha256 === undefined ? legacy :
 pinnedSharedRuntimeReceipt(fileURLToPath(new URL("../../../", import.meta.url)), receiptSha256).wasmSha256;
