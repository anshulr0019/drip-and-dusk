// Writes <link rel="modulepreload"> tags for every module app.mjs reaches statically, so browsers
// fetch the whole graph in one parallel round instead of discovering it import by import.
// Usage: node scripts/module-preloads.mjs   (rerun after adding or removing a module import)
import {readFileSync,writeFileSync} from 'node:fs';
const dist=new URL('../dist/',import.meta.url);
export function moduleGraph(entry='app.mjs'){
 const seen=new Set(),queue=[entry];
 while(queue.length){const file=queue.shift();if(seen.has(file))continue;seen.add(file);
  for(const m of readFileSync(new URL(file,dist),'utf8').matchAll(/(?:import|export)\s[^'"]*?from\s*'\.\/([^']+)'/g))queue.push(m[1]);}
 return [...seen].filter(f=>f!==entry).sort();
}
export const preloadTags=()=>moduleGraph().map(f=>`<link rel="modulepreload" href="${f}">`).join('');
const start='<!-- modulepreload:start -->',end='<!-- modulepreload:end -->';
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
 const file=new URL('index.html',dist),html=readFileSync(file,'utf8'),block=start+preloadTags()+end;
 const next=html.includes(start)?html.replace(new RegExp(start+'[\\s\\S]*?'+end),block):html.replace('<script type="module" src="app.mjs"></script>','<script type="module" src="app.mjs"></script>\n'+block);
 writeFileSync(file,next);console.log(moduleGraph().length+' modules preloaded');
}
