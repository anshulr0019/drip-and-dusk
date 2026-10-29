// Owner-uploaded product photos live in R2 (binding MEDIA) as content-addressed files, so the
// catalogue carries a short path instead of megabytes of inline image data.
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})};
const types={jpeg:{ext:'jpg',magic:[0xff,0xd8,0xff]},webp:{ext:'webp',magic:[0x52,0x49,0x46,0x46]}};
export const MAX_IMAGE_BYTES=1500000;
export const mediaPath=/^media\/[a-f0-9]{64}\.(jpg|webp)$/;
export async function storeImage(env,dataUrl){
 if(!env.MEDIA)fail('Photo storage is not configured yet.',503);
 const match=/^data:image\/(jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl||''));if(!match)fail('Upload a JPG or WebP image.');
 const type=types[match[1]],bytes=Uint8Array.from(atob(match[2]),c=>c.charCodeAt(0));
 if(!bytes.length||bytes.length>MAX_IMAGE_BYTES)fail('Choose an image under 1.5 MB after resizing.');
 if(!type.magic.every((b,i)=>bytes[i]===b))fail('This file is not a valid image.');
 const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join(''),key=`products/${hash}.${type.ext}`;
 await env.MEDIA.put(key,bytes,{httpMetadata:{contentType:'image/'+match[1]}});
 return 'media/'+hash+'.'+type.ext;
}
// Files are named by their content hash, so they can be cached forever.
export async function serveImage(env,path){
 const match=/^\/media\/([a-f0-9]{64})\.(jpg|webp)$/.exec(path);if(!match||!env.MEDIA)return new Response('Not found',{status:404});
 const object=await env.MEDIA.get(`products/${match[1]}.${match[2]}`);if(!object)return new Response('Not found',{status:404});
 return new Response(object.body,{headers:{'Content-Type':object.httpMetadata?.contentType||'image/jpeg','Cache-Control':'public, max-age=31536000, immutable','CDN-Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff'}});
}
