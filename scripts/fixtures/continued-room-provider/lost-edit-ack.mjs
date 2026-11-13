import assert from 'node:assert/strict';

const edit='Relay saved this edit before its reply ';

/** Intercept exactly one real durable reply before the SDK can observe it. */
export function interceptEditAcknowledgement({holdReply=true}={}){
 let armed=false,observed;
 const reply=Promise.withResolvers();
 const submitted=[];
 return {
  submitted,
  arm(){armed=true;},
  reply:reply.promise,
  socket(Base){
   return class extends Base {
    #requests=new Map();
    send(raw){
     const {id,request}=JSON.parse(raw);
     if(armed&&request.kind==='submit'){
      const group=JSON.parse(request.group);
      if(holdReply)this.#requests.set(id,group);
      submitted.push(group);
     }
     super.send(raw);
    }
    addEventListener(type,listener,options){
     if(type!=='message')return super.addEventListener(type,listener,options);
     return super.addEventListener(type,event=>{
      const {id,result}=JSON.parse(event.data);
      const group=this.#requests.get(id);
      this.#requests.delete(id);
      if(group&&result.kind==='durable'&&!observed){
       observed={group,receipt:result.receipt,sequence:result.sequence,duplicate:result.duplicate};
       reply.resolve(observed);
       return;
      }
      listener.call(this,event);
     },options);
    }
   };
  },
 };
}

export async function interruptAcknowledgedEdit(session,document,gate,crash){
 const {core}=session,before=session.exportDeliveryRecovery().relay.document;
 await document.connect();
 assert.equal(document.state().pending,false);
 gate.arm();
 assert.equal(core.dispatch({commands:[{kind:'insert_text',data:{block:'p',offset:0,text:edit}}]}),true);
 await session.flush();
 const pending=document.flush().then(()=>null,error=>error);
 let timer;
 try{
  const observed=await Promise.race([gate.reply,new Promise((_,reject)=>{
   timer=setTimeout(()=>reject(Error('Expected a real durable relay reply')),5000);
  })]);
  assert.equal(gate.submitted.length,1);
  assert.equal(observed.duplicate,false);
  assert.ok(BigInt(observed.sequence)>BigInt(before.receipt.sequence));
  const clock=core.writerClockV2(before.accepted.writer);
  assert.equal(observed.receipt.through,clock.through);
  assert.equal(observed.receipt.prefixDigest,clock.prefixDigest);
  assert.equal(observed.receipt.groupDigest,observed.group.groupDigest);
  assert.equal(observed.group.from,before.accepted.through);
  assert.deepEqual(session.exportDeliveryRecovery().relay.document,before);
  await crash();
  const error=await pending;
  assert.ok(error?.code==='connection_lost'||error?.code==='request_timeout');
  assert.deepEqual(session.exportDeliveryRecovery().relay.document,before);
  checkLostEdit(core);
  return {before,clock};
 }finally{clearTimeout(timer);}
}

export function checkLostEdit(core){
 assert.equal(core.documentJson().split(edit).length-1,1);
}
