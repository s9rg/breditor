/** Production dependency-graph entry, not a claim of browser or host-authorization testing. */
import {OperationalSharedParticipant} from "@breditor/collaboration";
export const beginParticipantOperation=options=>OperationalSharedParticipant.begin(options);
export const reopenParticipantOperation=options=>OperationalSharedParticipant.resume(options);
