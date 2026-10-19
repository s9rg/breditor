import {SharedRoomOperationalRecovery} from "@breditor/collaboration";
export const beginRoomOperation=options=>SharedRoomOperationalRecovery.begin(options);
export const resumeRoomOperation=options=>SharedRoomOperationalRecovery.resume(options);
