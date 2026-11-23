import {normalizeNote,parseNoteInput,searchReferenceNotes,validNoteList} from './fragrance-notes.mjs';

// A named accord may itself contain commas. Keep it together when editing either side of it.
export function noteEntryContext(value,caret){
 const parts=value.split(/([,;·\n])/);
 let offset=0;
 for(let i=0;i<parts.length;i+=2){
  let text=parts[i];
  for(const count of [5,3]){
   const run=parts.slice(i,i+count);
   if(run.length!==count||run.some((part,j)=>j%2?part!==',':!part.trim()))continue;
   const candidate=run.join('');
   if(parseNoteInput(candidate).length!==1)continue;
   text=candidate;
   i+=count-1;
   break;
  }
  const end=offset+text.length;
  if(caret<=end){
   const start=offset+(text.match(/^\s*/)?.[0].length||0);
   const otherNotes=parseNoteInput(value.slice(0,offset)).concat(parseNoteInput(value.slice(end)));
   return {start,end,query:value.slice(Math.min(start,caret),caret),otherNotes};
  }
  offset=end+1;
 }
 return {start:value.length,end:value.length,query:'',otherNotes:parseNoteInput(value)};
}

export function bindOwnerNoteAutocomplete(form,onNoteAdded){
 for(const input of form.querySelectorAll('.owner-note-entry textarea')){
  const list=input.parentElement.querySelector('[role=listbox]');
  let active=-1;
  let names=[];

  function close(){
   active=-1;
   names=[];
   list.hidden=true;
   input.removeAttribute('aria-activedescendant');
  }

  function update(){
   const {query,otherNotes}=noteEntryContext(input.value,input.selectionStart);
   if(normalizeNote(query).length<2||otherNotes.length>=24){close();return;}
   names=searchReferenceNotes(query,{exclude:otherNotes,limit:5});
   if(!names.length){close();return;}
   active=-1;
   input.removeAttribute('aria-activedescendant');
   list.replaceChildren(...names.map((name,index)=>{
    const option=document.createElement('li');
    option.id=list.id+'-'+index;
    option.setAttribute('role','option');
    option.setAttribute('aria-selected','false');
    option.textContent=name;
    return option;
   }));
   list.hidden=false;
  }

  function select(index){
   const name=names[index];
   if(!name)return;
   const {start,end,otherNotes}=noteEntryContext(input.value,input.selectionStart);
   const text=end===input.value.length?name+', ':name;
   if(input.value.length-end+start+text.length>input.maxLength||!validNoteList([...otherNotes,name])){close();return;}
   input.setRangeText(text,start,end,'end');
   close();
   input.focus({preventScroll:true});
   onNoteAdded();
  }

  input.addEventListener('input',event=>{if(!event.isComposing)update();});
  input.addEventListener('compositionend',update);
  input.addEventListener('click',update);
  input.addEventListener('blur',close);
  input.addEventListener('keydown',event=>{
   if(list.hidden||event.isComposing)return;
   if(event.key==='Escape'){
    event.preventDefault();
    event.stopPropagation();
    close();
   }else if(event.key==='ArrowDown'||event.key==='ArrowUp'){
    event.preventDefault();
    const direction=event.key==='ArrowDown'?1:-1;
    active=active<0?(direction===1?0:names.length-1):(active+direction+names.length)%names.length;
    [...list.children].forEach((option,index)=>option.setAttribute('aria-selected',String(index===active)));
    input.setAttribute('aria-activedescendant',list.children[active].id);
   }else if(event.key==='Enter'&&active>=0){
    event.preventDefault();
    select(active);
   }
  });
  input.addEventListener('keyup',event=>{
   if(['ArrowLeft','ArrowRight','Home','End','PageUp','PageDown'].includes(event.key))update();
  });
  list.addEventListener('mousedown',event=>event.preventDefault());
  list.addEventListener('click',event=>{
   const index=[...list.children].indexOf(event.target.closest('[role=option]'));
   if(index>=0)select(index);
  });
 }
}
