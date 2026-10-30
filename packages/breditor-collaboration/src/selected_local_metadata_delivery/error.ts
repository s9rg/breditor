/** Lightweight original local-metadata errors; no archive or native loader. */
export class LocalMetadataDeliveryError extends Error{constructor(readonly code='local_metadata_delivery_integrity'){super('Retain complete local native histories, explicit metadata bindings and exact original records');this.name='LocalMetadataDeliveryError';}}
export const fail=(code='local_metadata_delivery_integrity')=>new LocalMetadataDeliveryError(code);
