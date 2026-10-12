// Private decoder, not a replacement for public index validation.
const lengthGetter=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint32Array.prototype),"length").get;
export function decodeChildCountWords(words){
  let length;
  try{length=Reflect.apply(lengthGetter,words,[]);}catch{throw TypeError("invalid child count words");}
  if(!(words instanceof Uint32Array)||length!==2)throw TypeError("invalid child count words");
  const flag=words[0],count=words[1];
  if(flag===0&&count===0)return undefined;
  if(flag===1)return count;
  throw TypeError("invalid child count words");
}
