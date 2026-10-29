// Owner-uploaded product photos live in R2 (binding MEDIA) as content-addressed files, so the
// catalogue carries a short path instead of megabytes of inline image data.
// expose lets the Worker's catch-all show these 5xx messages and codes; they never contain provider details.
const fail=(message,status=400,code)=>{throw Object.assign(Error(message),{status,expose:true,code})};
const types={jpeg:{ext:'jpg',magic:[0xff,0xd8,0xff]},webp:{ext:'webp',magic:[0x52,0x49,0x46,0x46]}};
const isWebp=b=>b.length>=12&&[0x57,0x45,0x42,0x50].every((c,i)=>b[8+i]===c);
export const MAX_IMAGE_BYTES=1500000;
export const mediaPath=/^media\/[a-f0-9]{64}\.(jpg|webp)$/;
export async function storeImage(env,dataUrl){
 if(!env.MEDIA)fail('Photo storage is not configured yet.',503,'media_unconfigured');
 const match=/^data:image\/(jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl||''));if(!match)fail('Upload a JPG or WebP image.');
 const type=types[match[1]];let bytes;try{bytes=Uint8Array.from(atob(match[2]),c=>c.charCodeAt(0))}catch{fail('This file is not a valid image.')}
 if(!bytes.length||bytes.length>MAX_IMAGE_BYTES)fail('Choose an image under 1.5 MB after resizing.');
 if(!type.magic.every((b,i)=>bytes[i]===b)||(match[1]==='webp'&&!isWebp(bytes)))fail('This file is not a valid image.');
 const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join(''),key=`products/${hash}.${type.ext}`;
 try{await env.MEDIA.put(key,bytes,{httpMetadata:{contentType:'image/'+match[1]}})}catch{fail('Photo storage is unavailable. Try again.',503,'media_unavailable')}
 return 'media/'+hash+'.'+type.ext;
}
// Files are named by their content hash, so they can be cached forever.
export async function serveImage(env,path){
 const match=/^\/media\/([a-f0-9]{64})\.(jpg|webp)$/.exec(path);if(!match||!env.MEDIA)return new Response('Not found',{status:404});
 let object;try{object=await env.MEDIA.get(`products/${match[1]}.${match[2]}`)}catch{return new Response('Photo storage is unavailable.',{status:503,headers:{'Cache-Control':'no-store','Retry-After':'30','X-Content-Type-Options':'nosniff'}})}if(!object)return new Response('Not found',{status:404});
 return new Response(object.body,{headers:{'Content-Type':object.httpMetadata?.contentType||'image/jpeg','Cache-Control':'public, max-age=31536000, immutable','CDN-Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff'}});
}
