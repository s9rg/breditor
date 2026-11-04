/** Separate compact-observation family; original descriptor budgets are unchanged. */
export const MAX_PINNED_METADATA_SNAPSHOT_BYTES=32*1024*1024;
export function metadataPinsFailure(code:'metadata_pins_policy'|'metadata_pins_stale'|'metadata_pins_closed'='metadata_pins_policy'):Error&{readonly code:string}{
 return Object.assign(new Error('Retain exact bounded metadata observations and re-admit actual journals under their current leases'),{code});
}
