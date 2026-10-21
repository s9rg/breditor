/** Internal borrowed-history helpers do not become public owner/permission APIs. */
import {SharedAssetReferenceCapture,SharedGenerationSourceCapture,SharedIndependentSourceCapture} from '@breditor/collaboration';
// @ts-expect-error Internal reader registration is not a public package export.
import {registerCapturedNativeHistory} from '@breditor/collaboration';
// @ts-expect-error Internal borrowed capability is not a public package export.
import type {CapturedNativeHistoryRead} from '@breditor/collaboration';
declare const source:SharedAssetReferenceCapture|SharedGenerationSourceCapture|SharedIndependentSourceCapture;
source.check();source.metadata();source.records();source.dispose();
// @ts-expect-error A detached capture is not a mutable editor or native owner.
source.core;
// @ts-expect-error Borrowed native reads do not activate a room.
source.activate();
void registerCapturedNativeHistory;export type InternalMustStayUnavailable=CapturedNativeHistoryRead;
