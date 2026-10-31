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
// Behind Vercel every request arrives from Vercel's addresses, so cf-connecting-ip alone cannot separate visitors. The Vercel middleware signs the real client IP with a secret shared only with this Worker; an unsigned, stale or mismatched header is ignored, and raw X-Forwarded-For is never read.
const hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
// IPv6 customers hold whole /64 networks, so rate limits and caps are keyed on that prefix; otherwise one machine could rotate addresses freely.
function bucket(ip){
 const v=ip.toLowerCase();if(!v.includes(':'))return v;
 const mapped=v.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);if(mapped)return mapped[1];
 const [head,tail,...extra]=v.split('::');if(extra.length||v.includes('.'))return v;
 const a=head?head.split(':'):[],b=tail===undefined?[]:tail?tail.split(':'):[];
 if(tail===undefined&&a.length!==8||a.length+b.length>(tail===undefined?8:7))return v;
 const groups=[...a,...Array(8-a.length-b.length).fill('0'),...b];
 if(!groups.every(g=>/^[0-9a-f]{1,4}$/.test(g)))return v;
 return groups.slice(0,4).map(g=>parseInt(g,16).toString(16)).join(':')+'::/64';
}
export async function clientIP(request,env,now){
 const fallback={ip:bucket(request.headers.get('cf-connecting-ip')||'local'),source:'cf-connecting-ip'},key=env.PROXY_SIGNING_SECRET;
 if(typeof key!=='string'||key.length<32)return fallback;
 const h=request.headers,ip=h.get('x-dd-client-ip')||'',ts=h.get('x-dd-client-ts')||'',sig=h.get('x-dd-client-sig')||'';
 if(!/^[0-9a-fA-F:.]{2,45}$/.test(ip)||!/^\d{13}$/.test(ts)||Math.abs(now-Number(ts))>60000||!/^[0-9a-fA-F]{64}$/.test(sig))return fallback;
 const k=await crypto.subtle.importKey('raw',enc.encode(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const expected=hex(await crypto.subtle.sign('HMAC',k,enc.encode(`client-ip:v1:${ip}:${ts}:${request.method}:${new URL(request.url).pathname}`)));
 return same(sig.toLowerCase(),expected)?{ip:bucket(ip),source:'signed-proxy'}:fallback;
}
