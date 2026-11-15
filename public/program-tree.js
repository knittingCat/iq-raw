(function(root){
  const child=(b,n)=>b?.inputs?.[n]?.block||b?.inputs?.[n]?.shadow;
  const constants=new Set(['math_number','text','logic_boolean','logic_negate','logic_operation','logic_compare','math_arithmetic','math_single','math_constant','iqm_constant','iqm_compare','iqm_power']);
  function constant(b){
    if(!b||b.disabled||b.enabled===false||!constants.has(b.type))return {known:false};
    if(Object.values(b.inputs||{}).some(i=>!constant(i.block||i.shadow).known))return {known:false};
    try{const runtime=new root.IQSimulatorCore.Runtime(()=>{}),value=runtime.expr(b);return typeof value==='number'&&!Number.isFinite(value)?{known:false}:{known:true,value};}catch{return {known:false};}
  }
  function analyze(state){
    const nodes=[],byId=new Map();let next=0;
    const add=(b,parent=null,input='',unreachable='')=>{
      if(!b)return null;
      const id=b.id||`anonymous-${++next}`,node={id,block:b,parent,input,children:[],unreachable,disabled:b.disabled||b.enabled===false};nodes.push(node);byId.set(id,node);
      const reasons={};
      if(node.disabled)node.unreachable='Block is disabled.';
      if(b.type==='controls_if'){
        let priorAlways=false;
        for(const key of Object.keys(b.inputs||{}).filter(k=>/^IF\d+$/.test(k)).sort((a,b)=>+a.slice(2)-+b.slice(2))){
          const value=constant(child(b,key)),body='DO'+key.slice(2);
          if(priorAlways)reasons[body]='An earlier condition is always true.';
          else if(value.known&&!value.value)reasons[body]='Its condition is a constant false value.';
          if(value.known&&value.value)priorAlways=true;
        }
        if(priorAlways)reasons.ELSE='An earlier condition is always true.';
      }
      if(b.type==='controls_repeat_ext'){const n=constant(child(b,'TIMES'));if(n.known&&Number(n.value)<1)reasons.DO='The constant repeat count is less than one.';}
      if(['controls_whileUntil','iqv_repeat_until','iq_wait_until'].includes(b.type)){
        const v=constant(child(b,b.type==='controls_whileUntil'?'BOOL':b.type==='iq_wait_until'?'C':'COND'));
        if(v.known&&((b.type==='controls_whileUntil'&&Boolean(v.value)!==(b.fields?.MODE==='WHILE'))||(b.type==='iqv_repeat_until'&&v.value)))reasons.DO='The constant loop condition prevents entry.';
      }
      for(const [key,value]of Object.entries(b.inputs||{})){const c=add(value.block||value.shadow,node,key,node.unreachable||reasons[key]||'');if(c)node.children.push(c);}
      let following=unreachable;
      if(!node.disabled){
        if(b.type==='iqv_stop_project')following='A stop-project block ends this path before this block.';
        if(b.type==='iqv_forever'&&!JSON.stringify(b.inputs||{}).includes('controls_flow_statements'))following='An unconditional forever loop has no break exit.';
      }
      if(b.next?.block){const c=add(b.next.block,parent,'next',following);node.next=c;}
      return node;
    };
    const roots=(state.blocks?.blocks||[]).map(b=>add(b));return {nodes,byId,roots};
  }
  function valueText(value){if(typeof value==='string')return JSON.stringify(value.slice(0,160));if(typeof value==='number'&&!Number.isFinite(value))return String(value);try{return JSON.stringify(value)??String(value);}catch{return String(value);}}
  function kind(b){if(b.type.startsWith('controls_')||['iqv_forever','iqv_repeat_until','iq_wait_until'].includes(b.type))return 'Control';if(b.type==='iq_mb_argument'||b.type==='variables_get'||/_get$/.test(b.type)||b.type.startsWith('iq_b_')||['math_number','text','logic_boolean','iqm_constant','math_constant'].includes(b.type))return 'Data provider';if(/^(math_|logic_|iqm_)/.test(b.type))return 'Operator';if(/^(iq_ev_|iq_when_)/.test(b.type))return 'Event';return 'Action';}
  function attach(ws){
    const $=id=>document.getElementById(id),dialog=$('programTree'),svg=$('treeGraph'),summary=$('treeSummary'),inspector=$('treeInspector');
    const labels=document.createElement('div');labels.className='graph-link-labels';labels.setAttribute('aria-hidden','true');svg.parentElement.append(labels);
    const ns='http://www.w3.org/2000/svg',element=(name,attrs={},text)=>{const el=document.createElementNS(ns,name);for(const[k,v]of Object.entries(attrs))el.setAttribute(k,String(v));if(text!==undefined)el.textContent=text;return el;};
    const colours={provider:'#53c9e9',operator:'#ab94ff',control:'#ffbe5c',event:'#f0cc5a',action:'#79d5aa',unknown:'#73839c',taken:'#66dfa5',blocked:'#ee8893',error:'#ff626e'};
    const icons={provider:'M3 5c0-4 18-4 18 0s-18 4-18 0m0 0v14c0 4 18 4 18 0V5M3 12c0 4 18 4 18 0',operator:'M4 5h16M12 2v6M4 16h7m-3-3v6m7-5 5 5m0-5-5 5',control:'m12 2 10 10-10 10L2 12Z',event:'m13 2-9 12h7l-1 8 10-12h-7Z',action:'M3 12h18m-6-6 6 6-6 6'};
    let model,worker,version=0,records=new Map(),dirty=false,selected=null,renderTimer,graph,edges=[],nodeViews=new Map(),view={x:0,y:0,scale:1};
    const category=b=>kind(b)==='Data provider'?'provider':kind(b).toLowerCase();
    const snapshot=()=>root.Blockly.serialization.workspaces.save(ws);
    const stop=()=>{worker?.terminate();worker=null;$('treeStop').disabled=true;$('treeRun').disabled=false;};
    const label=node=>{try{return ws.getBlockById(node.id)?.toString(160)||node.block.type;}catch{return node.block.type;}};
    const short=(text,n=38)=>String(text).length>n?String(text).slice(0,n-1)+'…':String(text);
    const isBody=node=>/^(DO\d*|ELSE|STACK)$/.test(node.input);
    // Move the SVG camera, not a composited group. WebKit can retain old painted
    // group transforms inside a modal dialog, leaving a trail after each zoom.
    let cameraFrame=null;
    const transform=()=>{
      $('treeZoomLevel').textContent=Math.round(view.scale*100)+'%';
      if(cameraFrame!==null)return;
      cameraFrame=requestAnimationFrame(()=>{
        cameraFrame=null;const width=svg.clientWidth||900,height=svg.clientHeight||600;
        const box={x:-view.x/view.scale,y:-view.y/view.scale,width:width/view.scale,height:height/view.scale};
        svg.setAttribute('viewBox',`${box.x} ${box.y} ${box.width} ${box.height}`);
        for(const edge of edges){if(!edge.text)continue;edge.text.style.left=(view.x+edge.labelX*view.scale)+'px';edge.text.style.top=(view.y+(edge.labelY-14)*view.scale)+'px';}
        const background=svg.querySelector('.graph-backdrop');if(background)for(const[k,v]of Object.entries(box))background.setAttribute(k,String(v));
      });
    };
    function fit(){const width=svg.clientWidth||900,height=svg.clientHeight||600;view.scale=Math.min(1.2,(width-80)/Math.max(1,graph.graph().width),(height-80)/Math.max(1,graph.graph().height));view.scale=Math.max(.08,view.scale);view.x=(width-graph.graph().width*view.scale)/2;view.y=(height-graph.graph().height*view.scale)/2;transform();}
    function zoom(factor,cx=(svg.clientWidth||900)/2,cy=(svg.clientHeight||600)/2){const old=view.scale;view.scale=Math.max(.08,Math.min(2.5,old*factor));view.x=cx-(cx-view.x)*view.scale/old;view.y=cy-(cy-view.y)*view.scale/old;transform();}
    function select(id){selected=id;for(const[nodeId,el]of nodeViews)el.classList.toggle('selected',nodeId===id);details();}
    function details(){
      inspector.replaceChildren();const node=model?.byId.get(selected);if(!node){const p=document.createElement('p');p.textContent='Select a node to inspect its values, dependencies, condition history and errors.';inspector.append(p);return;}
      const record=records.get(node.id),heading=document.createElement('h3');heading.textContent=label(node);inspector.append(heading);
      const add=(title,text)=>{const h=document.createElement('h4'),p=document.createElement('p');h.textContent=title;p.textContent=text;inspector.append(h,p);};
      add('Type',kind(node.block)+' · '+node.block.type);
      add('Reachability',node.unreachable?'Never activates: '+node.unreachable:record?.count?'Observed '+record.count+' time(s). May run again.':'Not observed. It may activate on another path or event.');
      if(dirty)add('Stale trace','The workspace changed. Refresh or run a new trace.');
      if(record&&'value'in record)add('Latest value',valueText(record.value));
      if(record?.conditions)add('Conditions',Object.entries(record.conditions).map(([name,v])=>`${name}: true ${v.true} · false ${v.false}`).join('\n'));
      if(record?.branches)add('Activated paths',Object.entries(record.branches).map(([name,n])=>`${name}: ${n} time(s)`).join('\n'));
      if(record?.error)add('Error',record.error);
      const related=(title,id,text)=>{const button=document.createElement('button');button.type='button';button.textContent=title+' · '+text;button.onclick=()=>select(id);inspector.append(button);};
      if(record?.provider&&model.byId.has(record.provider))related('Value supplied by',record.provider,label(model.byId.get(record.provider)));
      if(node.children.length){const h=document.createElement('h4');h.textContent=record?.error?'Inputs at the error':'Input dependencies';inspector.append(h);for(const child of node.children){const r=records.get(child.id);related(child.input,child.id,r&&'value'in r?valueText(r.value):r?.count?'Path observed':'Not evaluated');}}
      const locate=document.createElement('button');locate.type='button';locate.textContent='Locate in block workspace';locate.onclick=()=>{if(ws.getBlockById(node.id)){dialog.close();ws.centerOnBlock(node.id);ws.highlightBlock(node.id);ws.getBlockById(node.id).select();}};inspector.append(locate);
    }
    function drawGraph(){
      svg.replaceChildren();labels.replaceChildren();edges=[];nodeViews.clear();graph=new root.dagre.graphlib.Graph({multigraph:true}).setGraph({rankdir:'LR',nodesep:36,ranksep:100,marginx:32,marginy:32}).setDefaultEdgeLabel(()=>({}));
      const defs=element('defs'),pattern=element('pattern',{id:'graph-grid',width:22,height:22,patternUnits:'userSpaceOnUse'});pattern.append(element('circle',{cx:1,cy:1,r:1,fill:'var(--line)'}));defs.append(pattern);for(const[color,hex]of Object.entries(colours)){const marker=element('marker',{id:'graph-arrow-'+color,viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:7,markerHeight:7,orient:'auto-start-reverse'});marker.append(element('path',{d:'M0 0 10 5 0 10Z',fill:hex}));defs.append(marker);}svg.append(defs,element('rect',{class:'graph-backdrop',x:0,y:0,width:900,height:600,fill:'url(#graph-grid)'}));
      for(const node of model.nodes)graph.setNode(node.id,{width:246,height:100});
      const connect=(from,to,label,kind,key)=>{const edge={from,to,label,kind,key,id:'edge-'+edges.length};edges.push(edge);graph.setEdge(from,to,{label,width:Math.min(150,label.length*7),height:18},edge.id);};
      for(const node of model.nodes){
        for(const child of node.children)isBody(child)?connect(node.id,child.id,child.input==='ELSE'?'false / else':child.input==='DO0'?'true':child.input,'branch',child.input):connect(child.id,node.id,({TEXT:'Text',VALUE:'Value',DEG:'Degrees',SECS:'Seconds',COND:'Condition',BOOL:'Condition'})[child.input]||child.input,'data',child.input);
        if(node.next)connect(node.id,node.next.id,node.block.type==='iq_mb_define'?'Body':'Next','flow','next');
        if(node.block.type==='iq_mb_call'&&model.byId.has(node.block.extraState?.definitionId))connect(node.id,node.block.extraState.definitionId,'Call','flow','call');
      }
      root.dagre.layout(graph);
      const world=element('g',{class:'graph-world'}),wireLayer=element('g',{class:'graph-connections'}),nodesLayer=element('g');world.append(wireLayer,nodesLayer);svg.append(world);
      for(const edge of edges){
        const layout=graph.edge({v:edge.from,w:edge.to,name:edge.id}),points=layout.points;
        const d=points.map((p,i)=>(i?'L':'M')+p.x+' '+p.y).join(' ');
        const wire=element('path',{d,fill:'none','stroke-width':2.5,class:'graph-edge','marker-end':'url(#graph-arrow-unknown)'});
        wireLayer.append(wire);
        // Ordinary HTML text avoids WebKit's SVG glyph clipping and repaint bugs.
        const text=document.createElement('span');text.className='graph-link-label';text.textContent=edge.label;labels.append(text);
        edge.view=wire;edge.text=text;edge.labelX=layout.x;edge.labelY=layout.y;
      }
      for(const node of model.nodes){
        const pos=graph.node(node.id),type=category(node.block),colour=colours[type]||colours.action;
        const group=element('g',{transform:`translate(${pos.x-123} ${pos.y-50})`,class:'graph-node',tabindex:0,role:'button','aria-label':kind(node.block)+': '+label(node),'data-node-id':node.id});
        group.append(element('title',{},label(node)),element('rect',{width:246,height:100,rx:14,class:'graph-card'}),element('rect',{x:0,y:12,width:4,height:76,rx:2,fill:colour}),element('rect',{x:14,y:14,width:30,height:30,rx:8,fill:colour,'fill-opacity':.15}));
        const icon=element('svg',{x:20,y:20,width:18,height:18,viewBox:'0 0 24 24',fill:'none',stroke:colour,'stroke-width':1.7,'stroke-linecap':'round','stroke-linejoin':'round'});icon.append(element('path',{d:icons[type]||icons.action}));group.append(icon,element('text',{x:54,y:27,class:'graph-kind',fill:colour},kind(node.block)),element('text',{x:54,y:44,class:'graph-title'},short(label(node),26)),element('text',{x:15,y:69,class:'graph-value'},''),element('circle',{cx:19,cy:86,r:3.5,class:'graph-status-dot'}),element('text',{x:29,y:90,class:'graph-status'},'Not observed'));
        group.onclick=()=>select(node.id);group.onkeydown=e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();select(node.id);}};nodesLayer.append(group);nodeViews.set(node.id,group);
      }
      update();requestAnimationFrame(fit);
    }
    function update(){
      for(const node of model.nodes){const el=nodeViews.get(node.id),record=records.get(node.id),state=record?.error?'error':node.unreachable?'blocked':record?.count?'taken':'unknown';el.classList.toggle('selected',selected===node.id);el.querySelector('.graph-status-dot').style.fill=colours[state];el.querySelector('.graph-status').textContent=record?.error?'Error · select for cause':node.unreachable?'Never activates':record?.count?`Observed ${record.count}×`:'Not observed · may activate';el.querySelector('.graph-status').setAttribute('fill',colours[state]);el.querySelector('.graph-value').textContent=record&&'value'in record?short(valueText(record.value),37):record?.conditions?short(Object.entries(record.conditions).map(([k,v])=>`${k} T:${v.true} F:${v.false}`).join('  ')):node.unreachable?'Statically unreachable':record?.count?'Executed':'Awaiting trace';}
      for(const edge of edges){const from=records.get(edge.from),to=records.get(edge.to),target=model.byId.get(edge.to);let state=target.unreachable?'blocked':edge.kind==='branch'?(from?.branches?.[edge.key]?'taken':'unknown'):to?.count&&from?.count?'taken':'unknown';if(to?.error)state='error';edge.view.style.stroke=colours[state];edge.view.setAttribute('marker-end','url(#graph-arrow-'+state+')');edge.view.setAttribute('stroke-dasharray',state==='unknown'?'5 6':state==='blocked'?'3 5':'');edge.text.style.color=colours[state];}
      // Last-writer dependencies are real runtime links, separate from structural wiring.
      svg.querySelector('.graph-provider-links')?.remove();const links=element('g',{class:'graph-provider-links'});for(const[id,r]of records){if(!r.provider||!graph.hasNode(id)||!graph.hasNode(r.provider))continue;const a=graph.node(r.provider),b=graph.node(id),wire=element('path',{d:`M${a.x} ${a.y-50} C${a.x} ${Math.min(a.y,b.y)-120},${b.x} ${Math.min(a.y,b.y)-120},${b.x} ${b.y-50}`,fill:'none',stroke:colours.provider,'stroke-width':2,'stroke-dasharray':'4 4','marker-end':'url(#graph-arrow-provider)'});wire.append(element('title',{},'Value supplied by the last executed assignment'));links.append(wire);}svg.querySelector('.graph-world').prepend(links);
      $('treeCount').textContent=`${model.nodes.length} nodes · ${model.nodes.filter(n=>n.unreachable).length} unreachable · ${records.size} observed`;details();
    }
    function build(){stop();records.clear();version++;model=analyze(snapshot());dirty=false;selected=null;drawGraph();summary.textContent='Static graph ready. Run a trace to see values, condition results and activated paths.';}
    function schedule(){if(renderTimer)return;renderTimer=setTimeout(()=>{renderTimer=null;if(dialog.open)update();},120);}
    $('treeToggle').onclick=()=>{dialog.showModal();$('treeToggle').setAttribute('aria-expanded','true');try{build();}catch(error){summary.textContent='Could not load graph: '+error.message+'. Reload the page.';}};$('treeClose').onclick=()=>dialog.close();dialog.addEventListener('close',()=>{stop();$('treeToggle').setAttribute('aria-expanded','false');});
    $('treeRefresh').onclick=build;$('treeStop').onclick=()=>{stop();summary.textContent='Trace stopped. The graph shows the stopped run.';};
    $('treeRun').onclick=()=>{try{build();}catch(error){summary.textContent='Could not start trace: '+error.message;return;}const current=version,instance=new Worker('/simulator-worker.js');worker=instance;$('treeStop').disabled=false;$('treeRun').disabled=true;summary.textContent='Tracing offline blocks…';instance.onmessage=({data})=>{if(worker!==instance||current!==version)return;if(data.type==='trace'){for(const record of data.nodes)records.set(record.id,record);schedule();}if(data.type==='error'){records.set(data.blockId,{...records.get(data.blockId),id:data.blockId,count:records.get(data.blockId)?.count||1,error:data.message});selected=data.blockId;summary.textContent='Error: '+data.message;stop();update();}if(data.type==='finished'){summary.textContent=data.interactive?'Main path finished. Check events remain active.':'Trace finished. Unvisited paths may activate under different inputs.';if(!data.interactive)stop();update();}if(data.type==='stopped'){summary.textContent='Program stopped itself.';stop();update();}};instance.onerror=e=>{summary.textContent=e.message;stop();};instance.postMessage({type:'run',state:snapshot(),trace:true});};
    for(const name of ['Check','Left','Right']){const el=$('tree'+name),send=down=>worker?.postMessage({type:'button',name:name.toLowerCase(),down});el.onpointerdown=e=>{el.setPointerCapture?.(e.pointerId);send(true);};for(const type of ['pointerup','pointercancel','lostpointercapture','blur'])el.addEventListener(type,()=>send(false));el.onkeydown=e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();send(true);}};el.onkeyup=e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();send(false);}};}
    let drag;svg.onpointerdown=e=>{if(e.target.closest('.graph-node'))return;drag={x:e.clientX,y:e.clientY,startX:view.x,startY:view.y};svg.setPointerCapture(e.pointerId);};svg.onpointermove=e=>{if(!drag)return;view.x=drag.startX+e.clientX-drag.x;view.y=drag.startY+e.clientY-drag.y;transform();};svg.onpointerup=svg.onpointercancel=()=>{drag=null;};svg.addEventListener('wheel',e=>{e.preventDefault();const bounds=svg.getBoundingClientRect();zoom(e.deltaY<0?1.12:1/1.12,e.clientX-bounds.left,e.clientY-bounds.top);},{passive:false});
    $('treeZoomIn').onclick=()=>zoom(1.2);$('treeZoomOut').onclick=()=>zoom(1/1.2);$('treeFit').onclick=fit;
    ws.addChangeListener(event=>{if(event.isUiEvent||!dialog.open)return;dirty=true;stop();summary.textContent='Workspace changed. Refresh or trace again.';schedule();});
    $('treeExport').onclick=()=>{if(!model)return;const blob=new Blob([JSON.stringify({scope:'offline block trace',stale:dirty,nodes:model.nodes.map(n=>({id:n.id,type:n.block.type,input:n.input,parent:n.parent?.id,unreachable:n.unreachable,trace:records.get(n.id)})),connections:edges.map(({from,to,label,kind})=>({from,to,label,kind}))},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='iq-raw-trace.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  }
  const api={analyze,constant,valueText,kind,attach};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.IQProgramTree=api;
})(typeof window!=='undefined'?window:globalThis);
