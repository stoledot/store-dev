/** Lightweight editor diagnostics before LaTeX.js renders the live preview. */
export interface LatexDraftDiagnostic { line:number; column:number; message:string; suggestion:string }

/** Finds common structural mistakes without pretending to be a complete LaTeX compiler. */
export function validateLatexDraft(source:string):LatexDraftDiagnostic[]{
  const issues:LatexDraftDiagnostic[]=[];
  const location=(offset:number)=>{const before=source.slice(0,offset),line=before.split('\n').length,last=before.lastIndexOf('\n');return {line,column:offset-last};};
  const add=(offset:number,message:string,suggestion:string)=>issues.push({...location(offset),message,suggestion});
  const groups:number[]=[];const environments:Array<{name:string;at:number}>=[];let math:{kind:string;at:number}|null=null;
  for(let i=0;i<source.length;){
    const ch=source[i];
    if(ch==='%'){let slashCount=0;for(let back=i-1;back>=0&&source[back]==='\\';back--)slashCount++;if(slashCount%2===0){const end=source.indexOf('\n',i);i=end<0?source.length:end+1;continue;}}
    if(ch==='\\'){
      const env=source.slice(i).match(/^\\(begin|end)\s*\{([^{}]+)\}/);
      if(env){const name=env[2].trim();if(env[1]==='begin')environments.push({name,at:i});else{const opened=environments.pop();if(!opened)add(i,`\\end{${name}} no tiene un entorno abierto.`,`Agrega \\begin{${name}} o elimina el cierre.`);else if(opened.name!==name)add(i,`Se esperaba \\end{${opened.name}} y se encontró \\end{${name}}.`,`Cierra el entorno ${opened.name} antes de cerrar ${name}.`);}i+=env[0].length;continue;}
      const token=['\\(','\\)','\\[','\\]'].find((value)=>source.startsWith(value,i));
      if(token){const isOpen=token==='\\('||token==='\\[',kind=token==='\\('||token==='\\)'?'inline':'display';if(isOpen){if(math)add(i,'Se abrió un delimitador matemático antes de cerrar el anterior.','Cierra el modo matemático anterior antes de abrir otro.');else math={kind,at:i};}else if(!math)add(i,`El delimitador ${token} no tiene apertura.`,`Agrega ${kind==='inline'?'\\(':'\\['} antes de esta expresión.`);else if(math.kind!==kind)add(i,'El delimitador de cierre no corresponde al de apertura.',`Cierra esta expresión con ${math.kind==='inline'?'\\)':'\\]'}.`);else math=null;i+=token.length;continue;}
      i+=Math.min(2,source.length-i);continue;
    }
    if(ch==='{'){groups.push(i);i++;continue;}
    if(ch==='}'){if(groups.length)groups.pop();else add(i,'Esta llave de cierre } no tiene una llave de apertura.','Agrega { o elimina esta llave.');i++;continue;}
    if(ch==='$'){
      const display=source[i+1]==='$';const token=display?'$$':'$';
      if(display){if(math?.kind==='display')math=null;else if(math)add(i,'No se puede abrir $$ dentro de otra expresión matemática.','Cierra primero la expresión anterior.');else math={kind:'display',at:i};}
      else if(math?.kind==='inline')math=null;else if(math)add(i,'El delimitador $ no coincide con el modo matemático abierto.','Usa el mismo tipo de delimitador para abrir y cerrar.');else math={kind:'inline',at:i};
      i+=token.length;continue;
    }
    i++;
  }
  for(const at of groups.reverse())add(at,'Falta cerrar esta llave { antes del final del texto.','Agrega } para cerrar el grupo.');
  for(const item of environments.reverse())add(item.at,`Falta \\end{${item.name}}.`,`Agrega \\end{${item.name}}.`);
  if(math)add(math.at,`Falta cerrar la expresión matemática iniciada con ${math.kind==='inline'?'$ o \\(' : '$$ o \\['}.`,`Agrega el delimitador de cierre correspondiente.`);
  return issues.slice(0,50);
}
