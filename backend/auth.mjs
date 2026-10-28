import {visitorId,visitorCookie,backendIP} from './traffic.mjs';
// Supabase verifies identity. Our cookie contains only a random, revocable session handle.
const enc=new TextEncoder(),dec=new TextDecoder();
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})};
const query=(env,sql,...args)=>env.DB.prepare(sql).bind(...args);
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff',...headers}});
const base64=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes))),unbase64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const url64=b=>base64(b).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
export const digest=async text=>url64(await crypto.subtle.digest('SHA-256',enc.encode(text)));
const random=()=>url64(crypto.getRandomValues(new Uint8Array(32)));
export const safeReturnPath=path=>['#account','#checkout','#admin','#collection'].includes(path)?path:'#account';
export function authReady(env){try{const u=new URL(env.SUPABASE_URL),o=new URL(env.PUBLIC_ORIGIN);return env.AUTH_PROVIDER==='supabase'&&u.protocol==='https:'&&!u.username&&!u.password&&!u.search&&!u.hash&&u.pathname==='/'&&!!env.SUPABASE_PUBLISHABLE_KEY&&(env.AUTH_SESSION_SECRET?.length||0)>=32&&(o.protocol==='https:'||['localhost','127.0.0.1'].includes(o.hostname))}catch{return false}}
export async function encrypt(env,value){const key=await crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',enc.encode(env.AUTH_SESSION_SECRET)),'AES-GCM',false,['encrypt']);const iv=crypto.getRandomValues(new Uint8Array(12));return base64(iv)+'.'+base64(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,enc.encode(JSON.stringify(value))))}
async function decrypt(env,value){const [iv,data]=value.split('.'),key=await crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',enc.encode(env.AUTH_SESSION_SECRET)),'AES-GCM',false,['decrypt']);return JSON.parse(dec.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unbase64(iv)},key,unbase64(data))))}
const cookieName=(env,name)=>new URL(env.PUBLIC_ORIGIN).protocol==='https:'?'__Host-'+name:name;
const cookieValue=(request,name,env)=>request.headers.get('Cookie')?.split(';').map(c=>c.trim()).find(c=>c.startsWith(cookieName(env,name)+'='))?.slice(cookieName(env,name).length+1)||'';
function cookie(env,name,value,seconds,path='/'){return `${cookieName(env,name)}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${new URL(env.PUBLIC_ORIGIN).protocol==='https:'?'; Secure':''}`}
async function body(request){const text=await request.text();if(text.length>3000)fail('Sign-in request is too large.',413);try{return JSON.parse(text)}catch{fail('Invalid sign-in request.')}}
async function throttle(env,key,max,time){const window=Math.floor(time/600000),hash=await digest('auth:'+key+':'+window);const r=await query(env,'INSERT INTO rate_limits(key,window,count) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count',hash,window).first();if(r.count>max)fail('Too many sign-in attempts. Try again in a few minutes.',429)}
async function browserThrottle(env,request,scope,max,time){
 const visitor=await visitorId(request,env,time),ip=backendIP(request);
 // Keep a shared origin guard as well; issuing fresh visitor cookies cannot remove it.
 await throttle(env,'origin:'+scope+':'+ip,300,time);
 await throttle(env,scope+':'+(visitor?'visitor:'+visitor:'ip:'+ip),max,time);
}
export function createAuthService({fetchExternal=(...a)=>fetch(...a),now=Date.now}={}){
 const cache=new WeakMap();
 async function provider(env,path,{method='GET',data,token}={}){let r;try{r=await fetchExternal(env.SUPABASE_URL.replace(/\/$/,'')+'/auth/v1/'+path,{method,signal:AbortSignal.timeout(15000),headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(data?{body:JSON.stringify(data)}:{})})}catch{fail('Sign-in service is temporarily unavailable.',503)}let value;try{value=await r.json()}catch{value={}}if(!r.ok)throw Object.assign(Error('Sign-in could not be verified. Please try again.'),{status:r.status===429?429:r.status>=500?503:401});return value;}
 function publicUser(u,env){return {id:u.id,email:u.email,name:String(u.user_metadata?.full_name||u.user_metadata?.name||u.email.split('@')[0]).slice(0,80),role:(env.AUTH_OWNER_IDS||'').split(',').map(x=>x.trim()).includes(u.id)?'owner':'customer'};}
 async function verifiedUser(env,token){const u=await provider(env,'user',{token});if(!u.id||!u.email||!u.email_confirmed_at||u.is_anonymous)fail('A verified email account is required.',401);return u;}
 async function session(request,env){
  if(cache.has(request))return cache.get(request);if(!authReady(env))return null;const handle=cookieValue(request,'dd_session',env);if(!/^[A-Za-z0-9_-]{43}$/.test(handle))return null;
  const hash=await digest(handle),time=now(),row=await query(env,'SELECT * FROM auth_sessions WHERE hash=?',hash).first();if(!row||row.expires_at<=time){if(row)await query(env,'DELETE FROM auth_sessions WHERE hash=?',hash).run();return null;}
  let tokens;try{tokens=await decrypt(env,row.tokens)}catch{await query(env,'DELETE FROM auth_sessions WHERE hash=?',hash).run();return null;}
  try{
   if(row.token_expires_at<=time+60000){const claim=await query(env,'UPDATE auth_sessions SET refresh_lock_until=? WHERE hash=? AND refresh_lock_until<=?',time+30000,hash,time).run();if(!claim.meta.changes)fail('Your session is refreshing. Please try again.',503);
    try{const refreshed=await provider(env,'token?grant_type=refresh_token',{method:'POST',data:{refresh_token:tokens.refresh_token}});if(!refreshed.access_token||!refreshed.refresh_token||!Number.isFinite(refreshed.expires_in))fail('Sign in again to continue.',401);tokens={access_token:refreshed.access_token,refresh_token:refreshed.refresh_token};await query(env,'UPDATE auth_sessions SET tokens=?,token_expires_at=?,refresh_lock_until=0 WHERE hash=?',await encrypt(env,tokens),time+refreshed.expires_in*1000,hash).run();}catch(e){await query(env,'UPDATE auth_sessions SET refresh_lock_until=0 WHERE hash=?',hash).run();throw e;}
   }
   const u=await verifiedUser(env,tokens.access_token);if(u.id!==row.user_id)fail('Sign in again to continue.',401);const result=publicUser(u,env);cache.set(request,result);return result;
  }catch(e){if(e.status===401){await query(env,'DELETE FROM auth_sessions WHERE hash=?',hash).run();cache.set(request,null);return null;}throw e;}
 }
 async function establish(env,tokens,request,expectedEmail=null){if(!tokens.access_token||!tokens.refresh_token||!Number.isFinite(tokens.expires_in))fail('The sign-in response was incomplete.',401);const u=await verifiedUser(env,tokens.access_token),user=publicUser(u,env),handle=random(),time=now();if(expectedEmail&&u.email.toLowerCase()!==expectedEmail)fail('The email account could not be verified.',401);await query(env,'INSERT INTO auth_sessions(hash,user_id,email,name,tokens,token_expires_at,expires_at) VALUES(?,?,?,?,?,?,?)',await digest(handle),user.id,user.email,user.name,await encrypt(env,{access_token:tokens.access_token,refresh_token:tokens.refresh_token}),time+tokens.expires_in*1000,time+8*3600000).run();const previous=cookieValue(request,'dd_session',env);if(previous)await query(env,'DELETE FROM auth_sessions WHERE hash=?',await digest(previous)).run();return {user,handle};}
 async function flow(request,env,kind){const handle=cookieValue(request,'dd_auth_flow',env);if(!/^[A-Za-z0-9_-]{43}$/.test(handle))fail('Sign-in expired. Start again.',401);const row=await query(env,'SELECT * FROM auth_flows WHERE hash=?',await digest(handle)).first();if(!row||row.kind!==kind||row.expires_at<=now()||row.attempts>=5)fail('Sign-in expired. Start again.',401);return row;}
 async function handle(request,env){
  const url=new URL(request.url),path=url.pathname,time=now();
  if(path==='/api/auth/config'&&request.method==='GET'){const visitor=await visitorCookie(request,env,time);return json({available:authReady(env),provider:env.AUTH_PROVIDER||'none',guestCheckout:true,ownerRestricted:env.AUTH_PROVIDER==='supabase',methods:{google:authReady(env)&&env.AUTH_GOOGLE_ENABLED==='true',email:authReady(env)&&env.AUTH_EMAIL_ENABLED!=='false'}},200,visitor?{'Set-Cookie':visitor}:{});}
  if(path==='/api/auth/session'&&request.method==='GET')return json({user:await session(request,env)});
  if(!path.startsWith('/api/auth/'))return null;
  if(!authReady(env))fail('Account sign-in is not connected yet. You can continue as a guest.',503);
  if(path==='/api/auth/email/start'&&request.method==='POST'){
   if(env.AUTH_EMAIL_ENABLED==='false')fail('Email sign-in is not enabled yet.',503);
   const b=await body(request),email=String(b.email||'').trim().toLowerCase();if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail('Enter a valid email address.');
   await browserThrottle(env,request,'email-start',8,time);await throttle(env,'email:'+email,3,time);
   const handle=random();await query(env,'INSERT INTO auth_flows(hash,kind,email,return_path,expires_at) VALUES(?,?,?,?,?)',await digest(handle),'email',email,safeReturnPath(b.returnTo),time+600000).run();
   try{await provider(env,'otp',{method:'POST',data:{email,create_user:true}})}catch(e){if(e.status!==401)throw e;/* Same response for blocked/nonexistent accounts. */}
   return json({message:'If this address can receive sign-in email, a code is on its way.'},200,{'Set-Cookie':cookie(env,'dd_auth_flow',handle,600,'/api/auth')});
  }
  if(path==='/api/auth/email/verify'&&request.method==='POST'){
   const b=await body(request),f=await flow(request,env,'email');if(!/^\d{6,10}$/.test(String(b.code||'')))fail('Enter the code from your email.');
   const attempt=await query(env,'UPDATE auth_flows SET attempts=attempts+1 WHERE hash=? AND attempts<5 RETURNING hash',f.hash).first();if(!attempt)fail('Sign-in expired. Start again.',401);
   const tokens=await provider(env,'verify',{method:'POST',data:{email:f.email,token:String(b.code),type:'email'}});const claimed=await query(env,'DELETE FROM auth_flows WHERE hash=? RETURNING hash',f.hash).first();if(!claimed)fail('Sign-in expired. Start again.',401);const result=await establish(env,tokens,request,f.email);
   const headers=new Headers({'Set-Cookie':cookie(env,'dd_session',result.handle,8*3600)});headers.append('Set-Cookie',cookie(env,'dd_auth_flow','',0,'/api/auth'));
   headers.set('Content-Type','application/json');headers.set('Cache-Control','no-store');headers.set('Referrer-Policy','no-referrer');return new Response(JSON.stringify({user:result.user,returnTo:f.return_path}),{headers});
  }
  if(path==='/api/auth/google/start'&&request.method==='POST'){
   if(env.AUTH_GOOGLE_ENABLED!=='true')fail('Google sign-in is not enabled yet.',503);
   await browserThrottle(env,request,'google',10,time);const b=await body(request),handle=random(),verifier=random(),challenge=await digest(verifier);
   await query(env,'INSERT INTO auth_flows(hash,kind,verifier,return_path,expires_at) VALUES(?,?,?,?,?)',await digest(handle),'google',await encrypt(env,verifier),safeReturnPath(b.returnTo),time+600000).run();
   const target=new URL(env.SUPABASE_URL.replace(/\/$/,'')+'/auth/v1/authorize');target.search=new URLSearchParams({provider:'google',prompt:'select_account',redirect_to:env.PUBLIC_ORIGIN+'/api/auth/callback',code_challenge:challenge,code_challenge_method:'s256'}).toString();return json({url:target.href},200,{'Set-Cookie':cookie(env,'dd_auth_flow',handle,600,'/api/auth')});
  }
  if(path==='/api/auth/callback'&&request.method==='GET'){
   try{const f=await flow(request,env,'google'),code=url.searchParams.get('code');if(!code||code.length>2000)fail('Sign-in failed.',401);const claimed=await query(env,'DELETE FROM auth_flows WHERE hash=? RETURNING hash',f.hash).first();if(!claimed)fail('Sign-in expired.',401);
    const tokens=await provider(env,'token?grant_type=pkce',{method:'POST',data:{auth_code:code,code_verifier:await decrypt(env,f.verifier)}}),result=await establish(env,tokens,request);
    const headers=new Headers({Location:env.PUBLIC_ORIGIN+'/'+safeReturnPath(f.return_path),'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});headers.append('Set-Cookie',cookie(env,'dd_session',result.handle,8*3600));headers.append('Set-Cookie',cookie(env,'dd_auth_flow','',0,'/api/auth'));return new Response(null,{status:303,headers});
   }catch{return new Response(null,{status:303,headers:{Location:env.PUBLIC_ORIGIN+'/#account/sign-in-failed','Cache-Control':'no-store','Referrer-Policy':'no-referrer','Set-Cookie':cookie(env,'dd_auth_flow','',0,'/api/auth')}});}
  }
  if(path==='/api/auth/logout'&&request.method==='POST'){
   const hash=await digest(cookieValue(request,'dd_session',env)),row=await query(env,'SELECT tokens FROM auth_sessions WHERE hash=?',hash).first();await query(env,'DELETE FROM auth_sessions WHERE hash=?',hash).run();cache.delete(request);
   if(row)try{const tokens=await decrypt(env,row.tokens);await provider(env,'logout?scope=local',{method:'POST',token:tokens.access_token})}catch{/* Local revocation succeeds even if the provider is unavailable. */}
   const flowHandle=cookieValue(request,'dd_auth_flow',env);if(flowHandle)await query(env,'DELETE FROM auth_flows WHERE hash=?',await digest(flowHandle)).run();const headers=new Headers({'Content-Type':'application/json','Cache-Control':'no-store'});headers.append('Set-Cookie',cookie(env,'dd_session','',0));headers.append('Set-Cookie',cookie(env,'dd_auth_flow','',0));return new Response(JSON.stringify({user:null}),{headers});
  }
  return json({error:'Account endpoint not found.'},404);
 }
 return {handle,session,configured:env=>env.AUTH_PROVIDER==='supabase'};
}
