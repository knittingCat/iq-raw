// VEX-style My Blocks, with stable identities for definitions and typed inputs.
(function(root){
  const B=root.Blockly,COLOUR='#d45b93',uid=()=>B.utils.idGenerator.genUid();
  const token=id=>Array.from(String(id)).map(c=>c.codePointAt(0).toString(16)).join('_');
  const functionName=s=>'my_'+token(s.definitionId),argumentName=p=>'arg_'+token(p.id);
  const params=s=>(s.parts||[]).filter(p=>p.kind!=='label');
  const definition=(ws,id)=>ws.getBlockById(id)?.type==='iq_mb_define'?ws.getBlockById(id):null;
  const headerCheck=(id,p)=>'MyBlockHeader:'+id+':'+p.id;
  function normalize(s,id){return {definitionId:id||s.definitionId||'',name:String(s.name??'my block').trim().slice(0,60),parts:(s.parts||[]).slice(0,16).map(p=>({id:p.id||uid(),kind:['number','boolean','label'].includes(p.kind)?p.kind:'number',name:String(p.name??'input').trim().slice(0,60)}))};}
  function label(block,text){block.appendDummyInput('TITLE').appendField(text,'NAME');}
  function signature(block,s){
    const old=block.signature||{parts:[]},connections=new Map();
    params(old).forEach((p,i)=>{const c=block.getInput('ARG'+i)?.connection?.targetConnection;if(c){c.disconnect();connections.set(p.id,c);}});
    for(const input of [...block.inputList])block.removeInput(input.name,true);
    block.signature=normalize(s,block.type==='iq_mb_define'?block.id:s.definitionId);
    const state=block.signature,isDefinition=block.type==='iq_mb_define';
    label(block,(isDefinition?'define ':'')+state.name);
    let i=0;
    for(const part of state.parts){
      if(part.kind==='label'){block.appendDummyInput('LABEL'+part.id).appendField(part.name);continue;}
      const input=block.appendValueInput((isDefinition?'PARAM':'ARG')+i).setCheck(isDefinition?headerCheck(block.id,part):part.kind==='boolean'?'Boolean':'Number');
      if(!isDefinition)input.appendField(part.name);
      const saved=connections.get(part.id);if(saved&&input.connection.getConnectionChecker().canConnect(input.connection,saved,false))input.connection.connect(saved);
      i++;
    }
    block.setInputsInline(true);if(block.rendered)block.render();
  }
  function ensureHeaders(block){
    if(block.type!=='iq_mb_define'||block.isInFlyout)return;
    params(block.signature).forEach((part,i)=>{
      const input=block.getInput('PARAM'+i);if(!input||input.connection.targetBlock())return;
      const reporter=block.workspace.newBlock('iq_mb_argument');reporter.loadExtraState({definitionId:block.id,paramId:part.id,name:part.name,kind:part.kind});
      reporter.setDeletable(false);input.connection.connect(reporter.outputConnection);
      if(reporter.initSvg){reporter.initSvg();reporter.render();}
    });
  }
  B.Blocks.iq_mb_define={
    init(){this.signature={definitionId:this.id,name:'my block',parts:[]};this.setColour(COLOUR);this.hat='cap';this.setNextStatement(true);label(this,'define my block');this.setTooltip('Define a reusable block. Drag its inputs into the blocks below it. Right-click to edit.');},
    saveExtraState(){return this.signature;},loadExtraState(s){signature(this,s);},
    customContextMenu(options){options.push({text:'Edit My Block',enabled:true,callback:()=>root.IQMyBlocks.edit?.(this)});},
  };
  B.Blocks.iq_mb_call={
    init(){this.signature={definitionId:'',name:'my block',parts:[]};this.setColour(COLOUR);this.setPreviousStatement(true);this.setNextStatement(true);label(this,'my block');},
    saveExtraState(){return this.signature;},loadExtraState(s){signature(this,s);},
    customContextMenu(options){const def=definition(this.workspace,this.signature.definitionId);options.push({text:'Edit My Block',enabled:!!def,callback:()=>root.IQMyBlocks.edit?.(def)});options.push({text:'Go to definition',enabled:!!def,callback:()=>{this.workspace.centerOnBlock(def.id);def.select();}});},
  };
  B.Blocks.iq_mb_argument={
    init(){this.argument={definitionId:'',paramId:'',name:'input',kind:'number'};this.setColour(COLOUR);this.setOutput(true,'Number');label(this,'input');this.setTooltip('An input to this My Block definition.');},
    saveExtraState(){return this.argument;},loadExtraState(s){this.argument={...s};this.setFieldValue(s.name,'NAME');this.setOutput(true,[s.kind==='boolean'?'Boolean':'Number',headerCheck(s.definitionId,{id:s.paramId})]);},
  };
  for(const type of ['iq_mb_define','iq_mb_call','iq_mb_argument']){B.Blocks[type].mutationToDom=function(){const xml=B.utils.xml.createElement('mutation');xml.setAttribute('state',JSON.stringify(this.saveExtraState()));return xml;};B.Blocks[type].domToMutation=function(xml){this.loadExtraState(JSON.parse(xml.getAttribute('state')));};}
  function update(ws,def,s){
    const state=normalize(s,def.id),names=params(state).map(p=>p.name.toLocaleLowerCase());
    if(!state.name||state.parts.some(p=>!p.name))throw Error('Give the block and each input or label a name.');
    if(new Set(names).size!==names.length)throw Error('Each input needs a different name.');
    if(ws.getAllBlocks(false).some(b=>b!==def&&((b.type==='iq_mb_define'&&b.signature.name.toLocaleLowerCase()===state.name.toLocaleLowerCase())||(b.type.startsWith('procedures_def')&&b.getFieldValue('NAME')?.toLocaleLowerCase()===state.name.toLocaleLowerCase()))))throw Error('A block or function already uses that name.');
    B.Events.setGroup(true);
    try{
      const before=def.saveExtraState(),headerChildren=params(before).map((_,i)=>def.getInputTargetBlock('PARAM'+i)).filter(Boolean);
      for(const reporter of headerChildren){reporter.setDeletable(true);reporter.dispose(false);}
      signature(def,state);ensureHeaders(def);
      for(const block of ws.getAllBlocks(false)){
        if(block.type==='iq_mb_call'&&block.signature.definitionId===def.id){const old=block.saveExtraState();signature(block,state);B.Events.fire(new B.Events.BlockChange(block,'mutation',null,JSON.stringify(old),JSON.stringify(state)));}
        if(block.type==='iq_mb_argument'&&block.argument.definitionId===def.id){const p=params(state).find(p=>p.id===block.argument.paramId);if(p){block.loadExtraState({definitionId:def.id,paramId:p.id,name:p.name,kind:p.kind});block.setWarningText(null);}else block.setWarningText('This input was removed from the My Block definition.');}
      }
      B.Events.fire(new B.Events.BlockChange(def,'mutation',null,JSON.stringify(before),JSON.stringify(state)));
    }finally{B.Events.setGroup(false);}
    ws.getToolbox?.()?.refreshSelection();return def;
  }
  function create(ws,s){const def=ws.newBlock('iq_mb_define');try{if(def.initSvg){def.initSvg();def.render();}update(ws,def,s);if(def.initSvg){def.initSvg();def.render();const metrics=ws.getMetrics();def.moveBy(metrics.viewLeft+80,metrics.viewTop+80);ws.centerOnBlock(def.id);def.select();}return def;}catch(error){def.dispose(false);throw error;}}
  function flyout(ws){
    const contents=[{kind:'button',text:'Make a Block',callbackKey:'IQ_MAKE_BLOCK'}];
    for(const def of ws.getAllBlocks(false).filter(b=>b.type==='iq_mb_define')){
      contents.push({kind:'label',text:def.signature.name});
      contents.push({kind:'block',type:'iq_mb_call',extraState:def.signature,inputs:Object.fromEntries(params(def.signature).map((p,i)=>['ARG'+i,{shadow:p.kind==='boolean'?{type:'logic_boolean',fields:{BOOL:'FALSE'}}:{type:'math_number',fields:{NUM:0}}}]))});
      for(const p of params(def.signature))contents.push({kind:'block',type:'iq_mb_argument',extraState:{definitionId:def.id,paramId:p.id,name:p.name,kind:p.kind}});
    }
    // Existing saved Blockly functions remain available and editable.
    const legacy=ws.getAllBlocks(false).filter(b=>b.type.startsWith('procedures_def'));
    if(legacy.length)contents.push({kind:'label',text:'Saved functions'},...legacy.map(def=>({kind:'block',type:def.type==='procedures_defreturn'?'procedures_callreturn':'procedures_callnoreturn',extraState:{name:def.getFieldValue('NAME'),params:def.getVars()}})));
    return contents;
  }
  for(const [language,g]of [['python',B.Python],['cpp',B.Cpp]]){
    g.forBlock.iq_mb_define=(b,g)=>{
      const s=b.signature,fn=functionName(s),body=g.blockToCode(b.getNextBlock())||'',declarations=params(s).map(p=>(language==='cpp'?(p.kind==='boolean'?'bool ':'double '):'')+argumentName(p)).join(', ');
      if(language==='cpp'){g.protos_.push(`void ${fn}(${declarations});`);g.definitions_['myblock_'+b.id]=`void ${fn}(${declarations}) {\n${g.prefixLines(body,g.INDENT)}}\n`;}
      else g.definitions_['myblock_'+b.id]=`def ${fn}(${declarations}):\n${body?g.prefixLines(body,g.INDENT):g.INDENT+'pass\n'}`;
      return null;
    };
    g.forBlock.iq_mb_call=(b,g)=>{
      const def=definition(b.workspace,b.signature.definitionId);if(!def){b.setWarningText('My Block definition is missing.');return (language==='cpp'?'//':'#')+' Missing My Block: '+b.signature.name+'\n';}b.setWarningText(null);
      const args=params(def.signature).map((p,i)=>g.valueToCode(b,'ARG'+i,g.ORDER_NONE)||(p.kind==='boolean'?(language==='cpp'?'false':'False'):'0')).join(', ');
      return `${functionName(def.signature)}(${args})${language==='cpp'?';':''}\n`;
    };
    g.forBlock.iq_mb_argument=(b,g)=>{
      const def=definition(b.workspace,b.argument.definitionId),part=def&&params(def.signature).find(p=>p.id===b.argument.paramId),valid=part&&b.getRootBlock()===def;
      b.setWarningText(valid?null:'Use this input inside its own My Block definition.');
      return [valid?argumentName(part):b.argument.kind==='boolean'?(language==='cpp'?'false':'False'):'0',g.ORDER_ATOMIC];
    };
    const thread=g.forBlock.iq_thread;
    if(thread)g.forBlock.iq_thread=(b,g)=>{const def=b.workspace.getAllBlocks(false).find(x=>x.type==='iq_mb_define'&&x.signature.name===b.getFieldValue('NAME'));if(!def)return thread(b,g);if(params(def.signature).length){b.setWarningText('A thread needs a My Block with no inputs.');return (language==='cpp'?'//':'#')+' Thread requires a My Block without inputs\n';}b.setWarningText(null);return language==='cpp'?`thread(${functionName(def.signature)});\n`:`Thread(${functionName(def.signature)})\n`;};
  }
  function attach(ws){
    const $=id=>document.getElementById(id),dialog=$('myBlockDialog');let draft,editing;
    function preview(){const view=$('myBlockPreview');view.replaceChildren();const name=document.createElement('span');name.textContent=$('myBlockName').value||'my block';view.append(name);for(const p of draft){const span=document.createElement('span');span.className='my-block-part '+p.kind;span.textContent=p.name||p.kind;view.append(span);}}
    function rows(){const list=$('myBlockParts');list.replaceChildren();draft.forEach((p,i)=>{const row=document.createElement('div');row.className='my-block-row';const label=document.createElement('label');label.textContent=p.kind==='label'?'Label':p.kind==='boolean'?'Boolean input':'Number input';const input=document.createElement('input');input.type='text';input.value=p.name;input.maxLength=60;input.setAttribute('aria-label',label.textContent+' name');input.oninput=()=>{p.name=input.value;preview();};label.append(input);row.append(label);for(const [text,title,fn,disabled]of [['↑','Move up',()=>{[draft[i-1],draft[i]]=[draft[i],draft[i-1]];rows();},i===0],['↓','Move down',()=>{[draft[i+1],draft[i]]=[draft[i],draft[i+1]];rows();},i===draft.length-1],['×','Remove '+p.name,()=>{draft.splice(i,1);rows();},false]]){const button=document.createElement('button');button.type='button';button.textContent=text;button.setAttribute('aria-label',title);button.disabled=disabled;button.onclick=fn;row.append(button);}list.append(row);});preview();}
    function open(def){editing=def||null;draft=def?structuredClone(def.signature.parts):[];$('myBlockName').value=def?.signature.name||'';$('myBlockTitle').textContent=def?'Edit My Block':'Make a Block';$('myBlockError').textContent='';rows();dialog.showModal();$('myBlockName').focus();}
    root.IQMyBlocks.edit=open;ws.registerButtonCallback('IQ_MAKE_BLOCK',()=>open());ws.registerToolboxCategoryCallback('IQ_MY_BLOCKS',()=>flyout(ws));
    for(const kind of ['number','boolean','label'])$('myBlockAdd_'+kind).onclick=()=>{if(draft.length>=16){$('myBlockError').textContent='Use up to 16 inputs and labels.';return;}draft.push({id:uid(),kind,name:kind==='label'?'label text':kind+' '+(draft.filter(p=>p.kind===kind).length+1)});rows();};
    $('myBlockName').oninput=preview;$('myBlockCancel').onclick=()=>dialog.close();$('myBlockForm').onsubmit=event=>{event.preventDefault();try{const s={name:$('myBlockName').value,parts:draft};editing?update(ws,editing,s):create(ws,s);dialog.close();}catch(error){$('myBlockError').textContent=error.message;}};
    let pending=false;
    const sync=()=>{pending=false;for(const def of ws.getAllBlocks(false).filter(b=>b.type==='iq_mb_define')){ensureHeaders(def);def.setDeletable(!ws.getAllBlocks(false).some(b=>b.type==='iq_mb_call'&&b.signature.definitionId===def.id));}
      for(const arg of ws.getAllBlocks(false).filter(b=>b.type==='iq_mb_argument'))arg.setDeletable(!(arg.getParent()?.type==='iq_mb_define'&&arg.getRootBlock()===arg.getParent()));
    };
    ws.addChangeListener(e=>{if(e.isUiEvent||pending)return;pending=true;setTimeout(sync,0);});sync();
  }
  const category=B.IQ_TOOLBOX.contents.find(c=>c.name==='Functions');if(category){category.name='My Blocks';category.custom='IQ_MY_BLOCKS';category.colour=COLOUR;}
  root.IQMyBlocks={attach,create,update,flyout,normalize,params,functionName,argumentName};
})(typeof window!=='undefined'?window:globalThis);
