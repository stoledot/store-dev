import { validateLatexDraft } from './latexDraft';

declare global { interface Window { renderLatexSource?:(source:string,target:Element|null)=>Promise<{ok:boolean;error?:unknown}> } }

const editor=document.getElementById('latex-source') as HTMLTextAreaElement|null;
const practice=document.getElementById('latex-practice') as HTMLElement|null;
const preview=document.getElementById('latex-preview');
const diagnostics=document.getElementById('latex-diagnostics');
const summary=document.getElementById('latex-diagnostics-summary');
const saveButton=document.getElementById('latex-save') as HTMLButtonElement|null;
const saveStatus=document.getElementById('latex-save-status');
const downloadLink=document.getElementById('latex-download') as HTMLAnchorElement|null;

if(editor&&practice&&preview&&diagnostics&&summary&&saveButton&&saveStatus){
  const api=practice.dataset.api??'';
  let savedSource=editor.value;
  let saveTimer:number|undefined;
  let previewTimer:number|undefined;
  let previewPending=false;
  let saving=false;
  let saveQueued=false;

  const showDiagnostics=()=>{
    const found=validateLatexDraft(editor.value);
    diagnostics.replaceChildren();
    summary.textContent=found.length?`${found.length} detalle${found.length===1?'':'s'} por revisar.`:'No encontramos errores de estructura.';
    summary.className=`mt-2 text-sm ${found.length?'text-amber-800':'text-emerald-700'}`;
    for(const item of found){
      const row=document.createElement('li');row.className='rounded-lg bg-amber-50 p-2 text-amber-950';
      const jump=document.createElement('button');jump.type='button';jump.className='text-left underline decoration-dotted';jump.textContent=`Línea ${item.line}, columna ${item.column}: ${item.message} ${item.suggestion}`;
      jump.addEventListener('click',()=>{const lines=editor.value.split('\n');const offset=lines.slice(0,item.line-1).reduce((total,line)=>total+line.length+1,0)+item.column-1;editor.focus();editor.setSelectionRange(offset,Math.min(editor.value.length,offset+1));});
      row.appendChild(jump);
      diagnostics.appendChild(row);
    }
  };

  const renderPreview=async()=>{
    if(!window.renderLatexSource){previewPending=true;return;}
    previewPending=false;
    try{
      const result=await window.renderLatexSource(editor.value,preview);
      if(!result.ok){summary.textContent='LaTeX.js encontró un fragmento que no pudo interpretar. Revisa el mensaje de la vista previa.';summary.className='mt-2 text-sm text-red-700';}
      else showDiagnostics();
    }catch{
      summary.textContent='No se pudo actualizar la vista previa. Revisa la conexión e intenta de nuevo.';summary.className='mt-2 text-sm text-red-700';
    }
  };

  const save=async()=>{
    if(saving){saveQueued=true;return;}
    if(editor.value===savedSource){saveStatus.textContent='Todo está guardado.';return;}
    saving=true;let succeeded=false;const snapshot=editor.value;saveButton.disabled=true;saveStatus.textContent='Guardando…';
    try{
      const response=await fetch(api,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'save_latex',source:snapshot})});
      
      const result=await response.json() as any;
      if(!response.ok)throw new Error(result.error||'No se pudo guardar.');

      savedSource=snapshot;
      succeeded=true;
      const when=new Date().toLocaleTimeString();saveStatus.textContent=`Guardado a las ${when}.`;
      showDiagnostics();
    }catch(error){saveStatus.textContent=error instanceof Error?error.message:'No se pudo guardar. Intenta otra vez.';}
    finally{saving=false;saveButton.disabled=false;if(saveQueued||(succeeded&&editor.value!==savedSource)){saveQueued=false;window.clearTimeout(saveTimer);saveTimer=window.setTimeout(()=>void save(),250);}}
  };

  editor.addEventListener('input',()=>{
    showDiagnostics();window.clearTimeout(previewTimer);previewTimer=window.setTimeout(renderPreview,300);
    window.clearTimeout(saveTimer);saveStatus.textContent='Cambios sin guardar…';saveTimer=window.setTimeout(()=>void save(),1000);
  });
  editor.addEventListener('blur',()=>{if(editor.value!==savedSource){window.clearTimeout(saveTimer);void save();}});
  saveButton.addEventListener('click',()=>{window.clearTimeout(saveTimer);void save();});
  downloadLink?.addEventListener('click',async(event)=>{
    if(editor.value===savedSource)return;
    event.preventDefault();window.clearTimeout(saveTimer);await save();
    if(editor.value!==savedSource){await new Promise((resolve)=>window.setTimeout(resolve,350));await save();}
    if(editor.value!==savedSource){saveStatus.textContent='No se descargó: guarda los cambios y vuelve a intentarlo.';return;}
    window.location.assign(downloadLink.href);
  });
  window.addEventListener('load',()=>{if(previewPending)void renderPreview();},{once:true});
  showDiagnostics();renderPreview();
}
