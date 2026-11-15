/** Compare native original-author clocks on two privately replayed read-only copies. */
import {replayPortableRecovery} from '../independent_operation/portable_replay.js';
import type {SharedIndependentDeliveryRecovery} from '../independent_delivery/contract.js';
import {independentDeliveryIdentity} from '../independent_delivery/identity.js';
import {sourceNativeRecoveryRead} from '../source_native_read.js';
import {clock} from '../relay/validation.js';
import {reviewClock} from '../relay/review_validation.js';
import type {SharedIndependentDeliveryBranchComparison,SharedIndependentDeliveryBranchLane} from './contract.js';
import type {BranchArchiveScope} from './scope.js';

type Clock={through:string;prefixDigest:string};

function compareLane(heads:readonly [Clock,Clock],at:(position:string)=>readonly [Clock,Clock]):SharedIndependentDeliveryBranchLane{
 const [current,incoming]=heads;
 const left=BigInt(current.through),right=BigInt(incoming.through);
 let known=0n;
 let upper=left<right?left:right;
 function compareAt(position:bigint){
  const through=String(position);
  const [a,b]=at(through);
  if(a.through!==through||b.through!==through)throw new Error('Native branch clock returned a different position');
  return a.prefixDigest===b.prefixDigest?a.prefixDigest:undefined;
 }
 let digest=compareAt(known);
 if(digest===undefined)throw new Error('Native branch origins differ');
 const overlap=compareAt(upper);
 const relation=overlap===undefined?'diverged':left===right?'equal':left>right?'current-ahead':'incoming-ahead';
 if(overlap!==undefined){
  known=upper;
  digest=overlap;
 }else{
  // Prefix digests include the preceding original operations/events. Search
  // between the shared origin and the proven different overlap.
  while(upper-known>1n){
   const middle=(known+upper)/2n;
   const common=compareAt(middle);
   if(common===undefined)upper=middle;
   else{
    known=middle;
    digest=common;
   }
  }
 }
 return Object.freeze({
  relation,currentThrough:current.through,incomingThrough:incoming.through,
  commonThrough:String(known),commonPrefixDigest:digest,
 });
}

export async function compareBranches(
 current:SharedIndependentDeliveryRecovery,
 incoming:SharedIndependentDeliveryRecovery,
 scope:BranchArchiveScope,
):Promise<SharedIndependentDeliveryBranchComparison>{
 const identity=current.source.identity;
 const owner=identity.native.writer;
 const {actor,principal}=identity.review;
 const session=scope.session(independentDeliveryIdentity(identity,current.relay.binding,current.retainedBinding));
 const left=await replayPortableRecovery(session,current,scope.check);
 try{
  const right=await replayPortableRecovery(session,incoming,scope.check);
  try{
   const a=sourceNativeRecoveryRead(left.core),b=sourceNativeRecoveryRead(right.core);
   const check=()=>{
    scope.check();
    left.checkCurrent();
    right.checkCurrent();
   };
   check();
   // The relay's immutable seed author must agree independently of later work.
   if(owner!=='1'){
    const first=clock(a.writerClockV2('1'),'1'),second=clock(b.writerClockV2('1'),'1');
    if(first.through!==second.through||first.prefixDigest!==second.prefixDigest){
     throw new Error('Native branch document genesis differs');
    }
   }
   const document=compareLane([clock(a.writerClockV2(owner),owner),clock(b.writerClockV2(owner),owner)],through=>{
    check();
    const result=[clock(a.writerClockAt(owner,through,2),owner),clock(b.writerClockAt(owner,through,2),owner)] as const;
    check();
    return result;
   });
   const review=compareLane([reviewClock(a.reviewWriterClock(actor,principal),actor),reviewClock(b.reviewWriterClock(actor,principal),actor)],through=>{
    check();
    const result=[reviewClock(a.reviewWriterClock(actor,principal,through),actor),reviewClock(b.reviewWriterClock(actor,principal,through),actor)] as const;
    check();
    return result;
   });
   left.check();
   right.check();
   check();
   return Object.freeze({documentClockVersion:2,document,review});
  }finally{
   right.dispose();
  }
 }finally{
  left.dispose();
 }
}
