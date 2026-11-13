import assert from 'node:assert/strict';

const edit='Relay saved this edit before its reply ';

/** Intercept real replies per socket and request ID, before the SDK sees them. */
export function interceptSocketAcknowledgements({holdReply=true}={}){
 const selected=new Map();
 return {
  arm(kind){
   assert.equal(selected.has(kind),false);
   const gate={observed:Promise.withResolvers(),submitted:[]};
   selected.set(kind,gate);
   return {reply:gate.observed.promise,submitted:gate.submitted};
  },
  socket(Base){
   return class extends Base {
    #requests=new Map();
    send(raw){
     const {id,request}=JSON.parse(raw);
     const gate=selected.get(request.kind);
     if(gate){
      if(holdReply)this.#requests.set(id,{gate,request});
      gate.submitted.push(request);
     }
     super.send(raw);
    }
    addEventListener(type,listener,options){
     if(type!=='message')return super.addEventListener(type,listener,options);
     return super.addEventListener(type,event=>{
      const {id,result}=JSON.parse(event.data);
      const pending=this.#requests.get(id);
      this.#requests.delete(id);
      if(pending){
       pending.gate.observed.resolve({request:pending.request,result});
       return;
      }
      listener.call(this,event);
     },options);
    }
   };
  },
 };
}

export async function observeUnacknowledgedEdit(session,document,gate){
 const {core}=session,before=session.exportDeliveryRecovery().relay.document;
 await document.connect();
 assert.equal(document.state().pending,false);
 const editReply=gate.arm('submit');
 assert.equal(core.dispatch({commands:[{kind:'insert_text',data:{block:'p',offset:0,text:edit}}]}),true);
 await session.flush();
 const pending=document.flush().then(()=>null,error=>error);
 let timer;
 try{
  const {request,result:observed}=await Promise.race([editReply.reply,new Promise((_,reject)=>{
   timer=setTimeout(()=>reject(Error('Expected a real durable relay reply')),5000);
  })]);
  const group=JSON.parse(request.group);
  assert.equal(editReply.submitted.length,1);
  assert.equal(observed.kind,'durable');
  assert.equal(observed.duplicate,false);
  assert.ok(BigInt(observed.sequence)>BigInt(before.receipt.sequence));
  const clock=core.writerClockV2(before.accepted.writer);
  assert.equal(observed.receipt.through,clock.through);
  assert.equal(observed.receipt.prefixDigest,clock.prefixDigest);
  assert.equal(observed.receipt.groupDigest,group.groupDigest);
  assert.equal(group.from,before.accepted.through);
  assert.deepEqual(session.exportDeliveryRecovery().relay.document,before);
  return {before,clock,async afterCrash(){
   const error=await pending;
   assert.ok(error?.code==='connection_lost'||error?.code==='request_timeout');
   assert.deepEqual(session.exportDeliveryRecovery().relay.document,before);
   checkLostEdit(core);
  }};
 }finally{clearTimeout(timer);}
}

export function checkLostEdit(core){
 assert.equal(core.documentJson().split(edit).length-1,1);
}
