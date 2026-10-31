// Vercel Routing Middleware: signs the real visitor IP so the Worker can tell visitors apart behind the Vercel proxy.
// UNVERIFIED ON VERCEL: this must be checked on a preview deployment before relying on it (see README, "Verify the visitor-IP signing"). Use /api/admin/summary clientIpSource: it should read "signed-proxy". If the middleware does not run with this static, legacy-routes project, use fallback B described in the README (a small proxy that fetches the Worker and adds the same three headers).
// Uses only Web APIs and no imports. The signed string must match backend/traffic.mjs clientIP().
export const config={matcher:['/api/:path*']};
const enc=new TextEncoder(),hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
const names=['x-dd-client-ip','x-dd-client-ts','x-dd-client-sig'];
export default async function middleware(request){
 const {pathname}=new URL(request.url);
 // Cached public reads and provider webhooks never need a visitor IP.
 if(/^\/api\/(catalogue|config)$/.test(pathname)||pathname.startsWith('/api/webhooks/'))return;
 const secret=process.env.PROXY_SIGNING_SECRET;if(typeof secret!=='string'||secret.length<32)return;
 // Vercel sets x-real-ip itself; x-forwarded-for is only a fallback, and its first entry is the client address Vercel saw.
 const candidate=request.headers.get('x-real-ip')||(request.headers.get('x-forwarded-for')||'').split(',')[0].trim();
 const ip=/^[0-9a-fA-F:.]{2,45}$/.test(candidate)?candidate:'',ts=String(Date.now());
 let sig='';
 if(ip){const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);sig=hex(await crypto.subtle.sign('HMAC',key,enc.encode(`client-ip:v1:${ip}:${ts}:${request.method}:${pathname}`)));}
 // Any client-supplied x-dd-client-* header is replaced (with blanks when no valid IP), so it can never reach the Worker.
 const forwarded=new Map([...request.headers].filter(([k])=>!names.includes(k.toLowerCase())));
 forwarded.set('x-dd-client-ip',ip);forwarded.set('x-dd-client-ts',ip?ts:'');forwarded.set('x-dd-client-sig',sig);
 const headers=new Headers({'x-middleware-next':'1','x-middleware-override-headers':[...forwarded.keys()].join(',')});
 for(const [k,v] of forwarded)headers.set('x-middleware-request-'+k,v);
 return new Response(null,{headers});
}
