import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

/** Exercise the actual SDK resource boundary using the same built or installed module graph. */
export async function verifyContinuedDeliveryActorHandoff(runtime,Session,session,options,deliver){
 const load=name=>import(pathToFileURL(resolve(runtime,'../persistence',name+'.js')).href);
 const [{NativeActorCloseRetention},{takeClosedNativeActorCohort,takeAcquiredActorCohort},
  {SharedWriterLease},{ReviewWriterLease},{RoomActorAcquisition}]=
  await Promise.all(['native_actor_close','stopped_actor_cohort','writer_lease','review_writer_lease','room_actor_acquisition'].map(load));
 const {capturedNativeHistoryRead,checkCapturedNativeActorRoute}=await import(
  pathToFileURL(resolve(runtime,'../native_history_read/registry.js')).href);
 const id='continued-participant',oldCore=session.core,{room,writer}=options.native,actor=options.review.actor;
 await session.flush();
 const source=session.exportDeliveryRecovery();
 const read=await session.readDeliveryRecords(()=>{});
 let history;
 try{
  history=capturedNativeHistoryRead(read);
  assert.equal(history.document.kind,options.documentHistory);
  assert.equal(history.review.kind,options.reviewHistory);
  assert.equal(history.document.checkpointJson(),source.source.documentCheckpoint);
  assert.equal(history.review.checkpointJson(),source.source.reviewCheckpoint);
  assert.throws(()=>NativeActorCloseRetention.prepare([{id,core:oldCore}]),error=>error.code==='actor_source_in_use');
 }finally{read.dispose();}
 assert.throws(()=>history.review.checkpointJson(),error=>error.code==='captured_history_source');
 const retention=NativeActorCloseRetention.prepare([{id,core:oldCore}]);
 const locked=async()=>{
  await assert.rejects(SharedWriterLease.acquire(room,writer),error=>error.code==='writer_in_use');
  await assert.rejects(ReviewWriterLease.acquire(room,actor),error=>error.code==='review_writer_in_use');
 };
 assert.throws(()=>takeClosedNativeActorCohort(retention),error=>error.code==='writer_retention_incomplete');
 await session.close();
 let cohort,route,staging,final;
 try{
  cohort=takeClosedNativeActorCohort(retention);
  assert.deepEqual(cohort.bindings(),[{id,factory:'continued-delivery',room,writer,actor}]);
  await locked();
  const stagedDatabase=options.database+'-handoff-stage',finalDatabase=options.database+'-handoff-final';
  route=cohort.route(id,{databases:[stagedDatabase,finalDatabase],finalDatabase});
  const wrongFamily=route.select({...options,database:stagedDatabase});
  await assert.rejects(Session.open(wrongFamily),error=>error.code==='actor_route_identity');
  let restoreCalled=false;
  const wrongTarget=route.select({...options,database:finalDatabase+'-unselected',restoreDocument(){
   restoreCalled=true;throw Error('Unselected namespace');
  }});
  await assert.rejects(Session.restoreDelivery(wrongTarget,source,'host-reacquired'),error=>error.code==='actor_route_identity');
  assert.equal(restoreCalled,false);
  const refused=route.select({...options,database:stagedDatabase,restoreDocument(){throw Error('test-native-restore-refusal');}});
  await assert.rejects(Session.restoreDelivery(refused,source,'host-reacquired'),/test-native-restore-refusal/);
  await locked();
  staging=await Session.restoreDelivery(route.select({...options,database:stagedDatabase}),source,'host-reacquired');
  assert.deepEqual(staging.exportDeliveryRecovery(),source);
  assert.throws(()=>route.checkFinal(staging.core),error=>error.code==='actor_route_final');
  await staging.close();staging=undefined;
  await locked();
  final=await Session.restoreDelivery(route.select({...options,database:finalDatabase}),source,'host-reacquired');
  assert.deepEqual(final.exportDeliveryRecovery(),source);
  assert.throws(()=>route.checkFinal(oldCore),error=>error.code==='native_actor_source');
  assert.throws(()=>cohort.commit(),error=>error.code==='actor_route_final');
  const held=await final.readDeliveryRecords(()=>{});
  try{checkCapturedNativeActorRoute(capturedNativeHistoryRead(held),route);}
  finally{held.dispose();}
  cohort.commit();
  await locked();
  assert.equal(final.core.redo(),true);
  assert.equal(final.core.redoReview().kind,'committed');
  await final.close();final=undefined;
  const acquisition=RoomActorAcquisition.begin({room,members:[{id,factory:'continued-delivery',writer,actor}],checkAuthority(){}});
  let acquired,coldRoute,reopen;
  try{
   await acquisition.acquire();
   acquired=takeAcquiredActorCohort(acquisition);
   coldRoute=acquired.route(id,{databases:[finalDatabase],finalDatabase});
   reopen=await Session.openDelivery(coldRoute.select({...options,database:finalDatabase}));
   const read=await reopen.readDeliveryRecords(()=>{});
   try{checkCapturedNativeActorRoute(capturedNativeHistoryRead(read),coldRoute);}
   finally{read.dispose();}
   acquired.commit();
   await locked();
   assert.match(reopen.core.documentJson(),/Continued offline text/);
   await deliver(reopen);
  }finally{
   await reopen?.discardAndClose();await coldRoute?.close();await acquired?.close();await acquisition.close();
  }
 }finally{
  await final?.discardAndClose();
  await staging?.discardAndClose();
  await route?.close();
  await cohort?.close();
 }
}
