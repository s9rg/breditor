/** Explicit NEW-family archive budgets. Existing snapshot/native bounds remain
 * unchanged. This is bounded provenance, not infinite retained-history support:
 * reaching a bound refuses without pruning, origin reset or native mutation. */
import {LOCAL_OPERATION_BACKUP_PREFIX_BYTES,MAX_LOCAL_OPERATION_BACKUP_HEADER_BYTES,MAX_LOCAL_OPERATION_BACKUP_BYTES} from '../independent_local_operation/portable_codec.js';
import {MAX_OPERATION_RASTER_REFERENCES} from '../independent_operation/portable_rasters.js';
import {MAX_INDEPENDENT_SOURCE_RECORDS} from '../independent_source/contract.js';
export const MAX_FLAT_LOCAL_STATES=128;
export const MAX_FLAT_LOCAL_HEADER_BYTES=MAX_LOCAL_OPERATION_BACKUP_HEADER_BYTES;
export const MAX_FLAT_LOCAL_STATE_BYTES=MAX_LOCAL_OPERATION_BACKUP_HEADER_BYTES;
export const MAX_FLAT_LOCAL_SEED_PREFIX_BYTES=LOCAL_OPERATION_BACKUP_PREFIX_BYTES+MAX_LOCAL_OPERATION_BACKUP_HEADER_BYTES;
/** Room for the admitted snapshot and later distinct data; deduplication does
 * not waive the total envelope or each format's own semantic/native limits. */
export const MAX_FLAT_LOCAL_BYTES=2*MAX_LOCAL_OPERATION_BACKUP_BYTES;
export const MAX_FLAT_LOCAL_PAYLOAD_BYTES=MAX_LOCAL_OPERATION_BACKUP_BYTES;
export const MAX_FLAT_LOCAL_PAYLOADS=2*MAX_OPERATION_RASTER_REFERENCES+MAX_FLAT_LOCAL_STATES*(2*127+MAX_INDEPENDENT_SOURCE_RECORDS+2)+2;
