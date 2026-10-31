import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,statSync,readFileSync} from 'node:fs';
import {imageVariants,imageSrcset,variantWidth} from '../dist/image-variants.mjs';
import {imageWidth} from '../scripts/image-variants.mjs';
const file=p=>new URL('../dist/'+p,import.meta.url);
test('every listed small photo exists, is a real smaller WebP, and has an existing original',()=>{
 const entries=Object.entries(imageVariants);assert.ok(entries.length>0);
 for(const [original,[small,width]] of entries){
  assert.match(original,/^assets\/[a-zA-Z0-9._-]+$/);assert.match(small,/^assets\/sm\/[a-zA-Z0-9._-]+\.webp$/);
  assert.ok(existsSync(file(original)),original+' is missing');assert.ok(existsSync(file(small)),small+' is missing');
  assert.ok(statSync(file(small)).size<statSync(file(original)).size,small+' should be smaller than its original');
  assert.equal(imageWidth(readFileSync(file(small))),variantWidth);assert.equal(imageWidth(readFileSync(file(original))),width);
 }
});
test('srcset is only produced for photos with a variant; uploads and unknown paths get none',()=>{
 const [original]=Object.keys(imageVariants);
 assert.match(imageSrcset(original),new RegExp(`^assets/sm/.+ ${variantWidth}w, ${original} \\d+w$`));
 for(const src of ['media/'+'a'.repeat(64)+'.jpg','data:image/png;base64,AAAA','assets/does-not-exist.jpg','constructor','__proto__',''])assert.equal(imageSrcset(src),'');
});
test('the hero images never get a small copy',()=>{for(const original of Object.keys(imageVariants))assert.doesNotMatch(original,/hero/)});
