/** Internal read-only reservation. This deliberately has no consume, transfer,
 * markReleased, database-close or lease-release operation. Genuine family
 * openers reserve their private busy state synchronously before using it. */
export interface OperationalReadWitness<S> {
 readonly value:S;
 verify():Promise<void>;
 check():void;
 /** Private native/storage/lifetime checks only, after all host callbacks. */
 current():void;
 release():void;
}
export interface OperationalReadReservation<S> {
 readonly states:readonly S[];
 prepare():Promise<void>;
 verify():Promise<void>;
 checkCurrent():void;
 /** Release read borrows and busy flags only; same-handle cleanup is retryable. */
 close():void;
}
const freeze=Object.freeze;
/** Trusted family implementation helper, not an admission path for caller DTOs.
 * The class-branded opener owns unlock and every native witness constructor. */
export function operationalReadReservation<S>(count:number,open:(index:number)=>Promise<OperationalReadWitness<S>>,unlock:()=>void,fail:()=>Error):OperationalReadReservation<S>{
 const held:OperationalReadWitness<S>[]=[],pending=new Set<OperationalReadWitness<S>>();
 let prepared=false,working=false,closing=false,closed=false,values:readonly S[]=[];
 const active=()=>{if(closing||closed||!prepared)throw fail();};
 const current=()=>{active();for(const row of held)row.current();};
 const work=async(run:()=>Promise<void>)=>{if(closing||closed||working)throw fail();working=true;try{await run();}finally{working=false;}};
 return freeze({
  get states(){current();return values;},
  prepare:()=>work(async()=>{
   if(prepared||held.length)throw fail();
   for(let index=0;index<count;index++){const row=await open(index);held.push(row);pending.add(row);row.check();}
   values=freeze(held.map(row=>row.value));prepared=true;current();
  }),
  verify:()=>work(async()=>{active();for(const row of held){await row.verify();row.check();}current();}),
  checkCurrent:current,
  close(){
   if(closed)return;if(working)throw fail();closing=true;let error:unknown;
   for(const row of [...pending].reverse())try{row.release();pending.delete(row);}catch(cause){error??=cause;}
   if(pending.size)throw error??fail();
   unlock();closed=true;
  },
 });
}
