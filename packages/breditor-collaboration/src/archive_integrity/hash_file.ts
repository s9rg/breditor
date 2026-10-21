/** Exact whole-file SHA-256 in bounded native chunks. This does not admit a file format or auth. */
import {archiveBlob,MAX_SHARED_ARCHIVE_DIGEST_BYTES} from "./policy.js";
import {prepareArchiveIntegrity} from "./context.js";
import type {SharedArchiveIntegrityOptions,SharedArchiveFileDigest} from "./contract.js";
export async function hashSharedArchive(input:Blob,options:SharedArchiveIntegrityOptions):Promise<SharedArchiveFileDigest>{const context=prepareArchiveIntegrity(options),file=archiveBlob(input,MAX_SHARED_ARCHIVE_DIGEST_BYTES),sha256=await context.digest(file);context.guard();return Object.freeze({bytes:file.size,sha256});}
