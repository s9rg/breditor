/** Lightweight runtime errors: native adapters must not eagerly load opt-in archive codecs. */
export class LocalReviewDeliveryError extends Error{constructor(readonly code:string='local_review_delivery_integrity'){super('Retain actual complete local histories, nonsecret binding and durable review receipts');this.name='LocalReviewDeliveryError';}}
export const fail=(code='local_review_delivery_integrity')=>new LocalReviewDeliveryError(code);
