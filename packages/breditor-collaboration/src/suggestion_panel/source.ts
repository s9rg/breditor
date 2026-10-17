import type {SharedSelectionPolicy} from "../types.js";
import {SharedRelayError} from "../relay/validation.js";
import type {SharedSuggestionQueue} from "../suggestions/queue.js";
import type {SharedSuggestionSync} from "../suggestions/sync.js";
import type {SharedSuggestionPanelSource,SharedSuggestionPanelEntry} from "./types.js";
/** Retain the exact native source and queue. This helper opens/closes no owners or connections. */
export function createSharedSuggestionPanelSource<P extends SharedSelectionPolicy>(queue:SharedSuggestionQueue<P>,sync?:SharedSuggestionSync<P>):SharedSuggestionPanelSource {
 const core=queue.core;
 function check(){if(queue.core!==core)throw new SharedRelayError("suggestion_source_replaced");const state=queue.state();if(state.closed||state.retiring)throw new SharedRelayError("suggestion_queue_closed");sync?.checkQueue(queue);}
 check();return Object.freeze({core,check,
  entries(){check();const rows=new Map<string,SharedSuggestionPanelEntry>();for(const suggestion of queue.proposals()){const local=queue.status(suggestion.id);rows.set(suggestion.id,{suggestion,publication:local.publication,decision:local.decision,local});}for(const entry of sync?.entries()??[]){const id=entry.publication.suggestion.id;rows.set(id,{suggestion:entry.publication.suggestion,...entry,local:rows.get(id)?.local??null});}return structuredClone([...rows.values()]);},
  packet(id:string){check();return queue.packet(id);},propose(title:string,time:string,draft:Parameters<typeof queue.propose>[2]){check();return queue.propose(title,time,draft);},
  queueDecision(id:string,choice:"accept"|"reject",time:string,preview?:Parameters<typeof queue.queueDecision>[3]){check();return queue.queueDecision(id,choice,time,preview);},
  stopDecision(id:string){check();queue.stopRetryingDecision(id);},stopPublication(id:string){check();queue.stopRetryingPublication(id);},resumePublication(id:string){check();queue.queuePacket(queue.packet(id));},
  async flush(){check();await queue.flush();check();},async retry(){check();await queue.retry();check();},state:()=>queue.state(),
  subscribe(listener:()=>void){check();const off=[queue.subscribe(listener),...(sync?[sync.subscribe(listener)]:[])];return()=>{for(const stop of off)stop();};},
  ...(sync?{syncState:()=>sync.state(),sync:async()=>{check();await sync.connect();check();},load:async(id:string)=>{check();const packet=await sync.loadSuggestion(id);check();return packet;}}:{}),
 });
}
