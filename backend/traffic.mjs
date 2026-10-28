// A signed anonymous browser ID separates real visitors behind the Vercel proxy.
// This cookie is never an authentication credential and grants no privileges.
const enc=new TextEncoder(),secret=env=>env.AUTH_SESSION_SECRET||env.TRACKING_SECRET;
const cookieName=env=>new URL(env.PUBLIC_ORIGIN).protocol==='https:'?'__Host-dd_visit':'dd_visit';
const read=(request,env)=>request.headers.get('Cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName(env)+'='))?.slice(cookieName(env).length+1)||'';
async function mac(env,value){const key=await crypto.subtle.importKey('raw',enc.encode(secret(env)),{name:'HMAC',hash:'SHA-256'},false,['sign']);return [...new Uint8Array(await crypto.subtle.sign('HMAC',key,enc.encode('visitor:'+value)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
const same=(a,b)=>{if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;};
export async function visitorId(request,env,now){
 if((secret(env)?.length||0)<32)return null;const parts=read(request,env).split('.');
 if(parts.length!==3||!/^[a-zA-Z0-9-]{36}$/.test(parts[0])||!/^\d{13}$/.test(parts[1])||!/^[a-f0-9]{64}$/.test(parts[2]))return null;
 const expiry=Number(parts[1]);if(expiry<=now||expiry>now+86400000)return null;
 return same(parts[2],await mac(env,parts[0]+'.'+parts[1]))?parts[0]:null;
}
export async function visitorCookie(request,env,now){
 if((secret(env)?.length||0)<32||await visitorId(request,env,now))return null;
 const value=crypto.randomUUID()+'.'+String(now+86400000),signed=value+'.'+await mac(env,value);
 return `${cookieName(env)}=${signed}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400${new URL(env.PUBLIC_ORIGIN).protocol==='https:'?'; Secure':''}`;
}
export const backendIP=request=>request.headers.get('cf-connecting-ip')||'local';
