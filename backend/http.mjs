// Bounded request-body reading shared by the Worker and the sign-in service. The size cap is enforced on bytes as they stream in, so a missing or lying Content-Length cannot make the Worker buffer an oversized body.
const fail=(message,status)=>{throw Object.assign(Error(message),{status})};
export async function readText(request,max,message='Request is too large.'){
 const declared=request.headers.get('Content-Length');
 if(declared!==null){if(!/^\d+$/.test(declared))fail('Enter valid request data.',400);if(Number(declared)>max)fail(message,413);}
 if(!request.body)return '';
 const reader=request.body.getReader(),chunks=[];let total=0;
 for(;;){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>max){await reader.cancel().catch(()=>{});fail(message,413);}chunks.push(value);}
 const bytes=new Uint8Array(total);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.byteLength;}
 return new TextDecoder().decode(bytes);
}
// Every JSON endpoint reads fields off the result, so null, arrays and primitives are rejected at the boundary.
export async function readJSON(request,max,message='Request is too large.',invalid='Enter valid request data.'){
 let value;try{value=JSON.parse(await readText(request,max,message))}catch(e){if(e.status)throw e;fail(invalid,400)}
 if(value===null||typeof value!=='object'||Array.isArray(value))fail(invalid,400);
 return value;
}
