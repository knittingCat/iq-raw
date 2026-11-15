(() => {
  // Blockly's category API supplies the colour; keep the marker round at every level.
  const dot = function (colour) {
    this.rowDiv_.style.borderLeft = '0';
    this.rowDiv_.style.setProperty('--category-colour', colour || 'var(--accent)');
  };
  class DotCategory extends Blockly.ToolboxCategory { addColourBorder_(colour) { dot.call(this, colour); } }
  class DotGroup extends Blockly.CollapsibleToolboxCategory { addColourBorder_(colour) { dot.call(this, colour); } }
  Blockly.registry.register(Blockly.registry.Type.TOOLBOX_ITEM, Blockly.ToolboxCategory.registrationName, DotCategory, true);
  Blockly.registry.register(Blockly.registry.Type.TOOLBOX_ITEM, Blockly.CollapsibleToolboxCategory.registrationName, DotGroup, true);

  // Blockly 10's autoClose=false means a permanently docked flyout: its metrics
  // reserve palette width even after hiding it. Suppress only the click-to-copy
  // gesture instead, preserving normal overlay layout, drag creation and closing.
  const blockClick=Blockly.Gesture.prototype.doBlockClick;
  Blockly.Gesture.prototype.doBlockClick=function(...args){
    if(this.flyout?.iqrawDragOnly)return;
    return blockClick.apply(this,args);
  };

  const icons = {
    send:'M4 12h15m-6-6 6 6-6 6M4 5v14', download:'M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4',
    play:'m8 4 12 8-12 8Z', stop:'M5 5h14v14H5Z', build:'m14 4 6 6-10 10-6-6ZM4 4l4 4',
    chip:'M7 7h10v10H7ZM3 8h4m-4 8h4m10-8h4m-4 8h4M8 3v4m8-4v4M8 17v4m8-4v4',
    settings:'M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6m-6 0v6',
    help:'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM9.6 9.2a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.2 1-1.2 1.8v.5M12 17h.01',
    code:'m8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18', console:'m4 6 5 5-5 5m8 1h8',
    tree:'M4 3v18m0-13h7m-7 9h7M11 5h9v6h-9ZM11 14h9v6h-9Z',
    fullscreen:'M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6',
    controls:'M4 6h16M4 12h16M4 18h16', refresh:'M20 8A8 8 0 1 0 20 16M20 3v5h-5',
    open:'M3 6h7l2 3h9l-3 11H3ZM3 10V6', save:'M4 3h13l3 3v15H4ZM8 3v6h8V3M8 21v-7h8v7',
    list:'M8 5h13M8 12h13M8 19h13M3 5h1m-1 7h1m-1 7h1', clear:'M4 7h16M9 3h6m-9 4 1 14h10l1-14M10 11v6m4-6v6',
    copy:'M8 8h13v13H8ZM16 8V3H3v13h5', connect:'M8 3v5m8-5v5M6 8h12v4a6 6 0 0 1-12 0ZM12 18v4',
  };
  function iconize(el, name, label, iconOnly=false) {
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    for(const [key,value] of Object.entries({viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':'1.8','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true',class:'button-icon'})) svg.setAttribute(key,value);
    const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',icons[name]||icons.controls);svg.append(path);
    const text=document.createElement('span');text.className='button-label';text.textContent=label;
    el.replaceChildren(svg,text);el.setAttribute('aria-label',label);el.title=label;
    if(iconOnly)el.classList.add('icon-only');
  }
  function restore(ws, saved) {
    if(saved) { try { Blockly.serialization.workspaces.load(JSON.parse(saved),ws); } catch { ws.clear(); } }
    if(!ws.getAllBlocks(false).length) {
      const start=ws.newBlock('iq_when_started');start.initSvg();start.render();start.moveBy(48,40);
    }
    ws.getFlyout().iqrawDragOnly=true;
    ws.getFlyout().setAutoClose(true);
  }
  function setup(ws,{api,log,bluetooth}) {
    const $=id=>document.getElementById(id);
    for(const [id,name,label] of [
      ['send','send','Download and run'],['sendOnly','download','Download'],['run','play','Run slot'],['stop','stop','Stop'],['build','build','Build only'],['vm','chip','Install Python VM'],
      ['refresh','refresh','Check brain'],['open','open','Open code'],['save','save','Save code'],['programs','list','Programs on brain'],['probe','chip','Probe brain API'],['helpLink','help','Help'],['settingsLink','settings','Settings'],
    ]) iconize($(id),name,label);
    for(const [id,name,label] of [['treeToggle','tree','Program tree'],['fullscreenToggle','fullscreen','Fullscreen focus mode'],['controlsToggle','controls','Program controls'],['codeToggle','code','Show or hide code'],['consoleToggle','console','Show or hide console'],['previewToggle','chip','Brain preview'],['consoleClear','clear','Clear console'],['consoleCopy','copy','Copy console']]) iconize($(id),name,label,true);
    const source=$('sourcePanel'),consolePanel=$('consolePanel');
    const state={code:true,console:true,controls:true};
    const paint=()=>{
      source.hidden=!state.code;consolePanel.hidden=!state.console;
      $('codeSidebar').hidden=!state.code&&!state.console;
      document.body.classList.toggle('no-sidebar',!state.code&&!state.console);
      document.body.classList.toggle('controls-collapsed',!state.controls);
      for(const key of ['code','console']) $(key+'Toggle').setAttribute('aria-pressed',String(state[key]));
      $('controlsToggle').setAttribute('aria-expanded',String(state.controls));
      Blockly.svgResize(ws);
    };
    for(const key of ['code','console','controls']) $(key+'Toggle').onclick=()=>{state[key]=!state[key];paint();};
    document.addEventListener('iqraw-transfer-start',()=>{state.console=true;paint();});
    let focused=false,previous;
    const focus=(on)=>{
      if(on===focused)return;
      focused=on;document.body.classList.toggle('focus-mode',on);
      if(on){previous={...state};Object.assign(state,{code:false,console:false,controls:false});}
      else if(previous)Object.assign(state,previous);
      $('fullscreenToggle').setAttribute('aria-pressed',String(on));paint();
    };
    $('fullscreenToggle').onclick=async()=>{
      if(focused){if(document.fullscreenElement)await document.exitFullscreen();focus(false);}
      else{focus(true);try{await document.documentElement.requestFullscreen?.();}catch{/* Compact focus mode still works if browser fullscreen is unavailable. */}}
    };
    document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement)focus(false);});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&focused&&!document.fullscreenElement)focus(false);});
    const terminal=IQConsole.create($('log'),$('liveMonitors'));
    document.addEventListener('iqraw-command-start',()=>terminal.hold());
    document.addEventListener('iqraw-command-end',()=>terminal.release());
    $('consoleClear').onclick=async()=>{terminal.clear();if(bluetooth?.mode())return;try{await api('console/clear',{});}catch(e){log(e.message,'err');}};
    $('consoleCopy').onclick=async()=>{try{await navigator.clipboard.writeText($('log').textContent);}catch{log('Copy failed. Select and copy the console text manually.','err');}};
    let connected=false,usbConnected=false;
    document.addEventListener('iqraw-bluetooth-data',e=>{if(bluetooth?.mode())terminal.append(e.detail);});
    document.addEventListener('iqraw-bluetooth-state',e=>{if(bluetooth?.mode())consoleState(e.detail.connected);});
    document.addEventListener('iqraw-transport-change',()=>consoleState(bluetooth?.mode()?bluetooth.connected():usbConnected));
    const consoleState=on=>{
      connected=on;$('consoleConnect').textContent=on?'Disconnect':'Connect brain';
      $('consoleInput').disabled=!on;$('consoleSend').disabled=!on;
      $('consoleStatus').textContent=on?(bluetooth?.mode()?'Live Bluetooth brain output':'Live brain output'):'Tool output · brain disconnected';
    };
    const stream=new EventSource('/api/console/events');
    stream.addEventListener('data',e=>{
      const data=JSON.parse(e.data);
      if(!bluetooth?.mode())terminal.append(data);
    });
    stream.addEventListener('clear',()=>{if(!bluetooth?.mode())terminal.clear();});
    stream.addEventListener('state',e=>{usbConnected=JSON.parse(e.data).connected;if(!bluetooth?.mode())consoleState(usbConnected);});
    stream.addEventListener('console-error',e=>log(JSON.parse(e.data),'err'));
    $('consoleConnect').onclick=async()=>{
      if(bluetooth?.mode()){if(connected)bluetooth.disconnect();else bluetooth.connect();return;}
      $('consoleConnect').disabled=true;
      try{const j=await api('console/'+(connected?'disconnect':'connect'),{});consoleState(j.connected);}
      catch(e){log(e.message,'err');}finally{$('consoleConnect').disabled=false;}
    };
    $('consoleForm').onsubmit=async e=>{
      e.preventDefault();if(!connected)return;
      const text=$('consoleInput').value;
      try{if(bluetooth?.mode())await bluetooth.input(text+'\n');else await api('console/input',{text:text+'\n'});log('› '+text);$('consoleInput').value='';}catch(e){log(e.message,'err');}
    };
    window.addEventListener('pagehide',()=>stream.close());
    consoleState(bluetooth?.mode()?bluetooth.connected():false);paint();
  }
  window.IQEditor={restore,setup};
})();
