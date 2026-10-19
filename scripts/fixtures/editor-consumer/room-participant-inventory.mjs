/** Production installed import: no synthetic storage, React, test fixture or workspace runtime. */
import {readSharedRoomParticipantInventory,SharedRoomParticipantInventory} from "@breditor/collaboration";
globalThis.breditorParticipantInventory=Object.freeze({read:readSharedRoomParticipantInventory,Inventory:SharedRoomParticipantInventory});
