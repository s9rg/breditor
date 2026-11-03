/** Inert choice retention has no public or runtime ownership grant. */
import * as publicApi from '@breditor/collaboration';
import {retainActivationChoice} from '../../../packages/breditor-collaboration/dist/room_native_activation_intent/retain_choice.js';
import type {RoomActivationIntentChoice} from '../../../packages/breditor-collaboration/dist/room_native_activation_intent/contract.js';
declare const choice:RoomActivationIntentChoice,signal:AbortSignal,check:()=>void;
const result:Promise<void>=retainActivationChoice(choice,async selected=>{const same:RoomActivationIntentChoice=selected;void same;
// @ts-expect-error Retention receives immutable choice DATA.
selected.database='changed';
},check,[signal]);
// @ts-expect-error A retention hook returns completion, never an approval boolean.
void retainActivationChoice(choice,()=>true,check,[signal]);
// @ts-expect-error No public root method grants preparation or ownership via a hook.
void publicApi.retainActivationChoice;
void result;
