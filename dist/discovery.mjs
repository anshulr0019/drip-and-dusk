import {catalogue,catalogueDisplay} from './core.mjs';
export function paginate(list,page=1,pageSize=8){const pages=Math.max(1,Math.ceil(list.length/pageSize)),current=Math.max(1,Math.min(pages,Math.trunc(page)||1)),start=(current-1)*pageSize;return {items:list.slice(start,start+pageSize),page:current,pages,start,total:list.length};}
export function rememberView(ids,id){return [id,...ids.filter(x=>typeof x==='string'&&x!==id)].slice(0,20);}
export function recentProducts(products,ids){const visible=new Map(catalogue(products).map(p=>[p.id,p])),seen=new Set();return ids.map(id=>visible.get(id)).filter(p=>{if(!p||seen.has(p.group||p.id))return false;seen.add(p.group||p.id);return true;}).slice(0,6);}
export const hotSellers=products=>catalogueDisplay(catalogue(products).filter(p=>p.hotSeller),'all').slice(0,4);

// Keep navigation bounded even when the catalogue has hundreds of products.
export function pageWindow(page,pages){const keep=new Set([1,pages,page-1,page,page+1]);if(page<=3)[2,3,4].forEach(n=>keep.add(n));if(page>=pages-2)[pages-3,pages-2,pages-1].forEach(n=>keep.add(n));const out=[];for(const n of [...keep].filter(n=>n>=1&&n<=pages).sort((a,b)=>a-b)){const last=out.at(-1);if(typeof last==='number'&&n-last>1)out.push(null);out.push(n);}return out;}
