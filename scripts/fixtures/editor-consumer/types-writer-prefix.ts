/** Public read data is not a document author, source custody or server grant. */
import * as api from '@breditor/collaboration';
declare const core:api.SharedRichEditor;
const supported:boolean=core.supportsWriterPrefixRead();
const original=core.writerClockAt('9007199254740993','100');
const atomic=core.writerClockAt('9007199254740993','100',2);
const counter:string=original.through,digest:string=atomic.prefixDigest;
void [supported,counter,digest];
// @ts-expect-error Native author counters are canonical strings, never lossy JS numbers.
core.writerClockAt('9007199254740993',100);
// @ts-expect-error Select one existing digest family explicitly.
core.writerClockAt('9007199254740993','100',3);
// @ts-expect-error A prefix receipt is detached read data, not a writable source.
original.dispatch({commands:[]});
// @ts-expect-error The internal native history registry grants no public root constructor.
api.registerCapturedNativeHistory;
// @ts-expect-error A prefix read grants no public server activation capability.
api.activateRoom;
