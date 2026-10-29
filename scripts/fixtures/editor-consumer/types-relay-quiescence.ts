/** Public document/comment drain methods preserve policy typing and return no
 * transfer, packet ACK, source replacement or server-activation capability. */
import type {SharedRelaySync,SharedReviewRelaySync} from '@breditor/collaboration';
declare const document:SharedRelaySync<'document-v1'>,review:SharedReviewRelaySync<'document-v1'>;
const waits:Promise<void>[]=[document.waitForDisconnected(),review.waitForDisconnected()];void waits;
// @ts-expect-error A completed drain is not a source owner.
const source:{core:unknown}=await document.waitForDisconnected();void source;
