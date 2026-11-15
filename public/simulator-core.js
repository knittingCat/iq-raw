// Offline block interpreter. Never evaluates Python, C++, or arbitrary JavaScript.
(function(root){
  const {Devices}=typeof require!=='undefined'&&typeof module!=='undefined'?require('./simulator-devices'):root.IQSimulatorDevices;
  const child=(b,n)=>b?.inputs?.[n]?.block||b?.inputs?.[n]?.shadow;
  const field=(b,n,d='')=>b?.fields?.[n]??d;
  const variable=b=>{const v=field(b,'VAR');return typeof v==='object'?(v.id||v.name):v;};
  const compare=(a,op,b)=>({'<':()=>a<b,'<=':()=>a<=b,'>':()=>a>b,'>=':()=>a>=b,'==':()=>a===b,'!=':()=>a!==b})[op]?.()??false;
  const away=x=>Math.sign(x)*Math.floor(Math.abs(x)+0.5);
  const z=v=>typeof v==='object'&&v!==null&&'re'in v?v:{re:Number(v),im:0};
  const add=(a,b)=>({re:a.re+b.re,im:a.im+b.im});
  const mul=(a,b)=>({re:a.re*b.re-a.im*b.im,im:a.re*b.im+a.im*b.re});
  const div=(a,b)=>{const d=b.re*b.re+b.im*b.im;return {re:(a.re*b.re+a.im*b.im)/d,im:(a.im*b.re-a.re*b.im)/d};};
  const exp=a=>({re:Math.exp(a.re)*Math.cos(a.im),im:Math.exp(a.re)*Math.sin(a.im)});
  const ln=a=>({re:Math.log(Math.hypot(a.re,a.im)),im:Math.atan2(a.im,a.re)});
  const sin=a=>({re:Math.sin(a.re)*Math.cosh(a.im),im:Math.cos(a.re)*Math.sinh(a.im)});
  const cos=a=>({re:Math.cos(a.re)*Math.cosh(a.im),im:-Math.sin(a.re)*Math.sinh(a.im)});
  const COMPLEX=[a=>({re:Math.sqrt((Math.hypot(a.re,a.im)+a.re)/2),im:(a.im<0?-1:1)*Math.sqrt((Math.hypot(a.re,a.im)-a.re)/2)}),exp,ln,sin,cos,a=>div(sin(a),cos(a)),a=>({re:a.re,im:-a.im}),a=>({re:Math.sinh(a.re)*Math.cos(a.im),im:Math.cosh(a.re)*Math.sin(a.im)}),a=>({re:Math.cosh(a.re)*Math.cos(a.im),im:Math.sinh(a.re)*Math.sin(a.im)})];
  const REAL={sqrt:Math.sqrt,abs:Math.abs,ln:Math.log,log10:Math.log10,exp:Math.exp,sin:Math.sin,cos:Math.cos,tan:Math.tan,cot:x=>1/Math.tan(x),sec:x=>1/Math.cos(x),csc:x=>1/Math.sin(x),asin:Math.asin,acos:Math.acos,atan:Math.atan,acot:x=>Math.atan2(1,x),asec:x=>Math.acos(1/x),acsc:x=>Math.asin(1/x),sinh:Math.sinh,cosh:Math.cosh,tanh:Math.tanh,coth:x=>1/Math.tanh(x),sech:x=>1/Math.cosh(x),csch:x=>1/Math.sinh(x),asinh:Math.asinh,acosh:Math.acosh,atanh:Math.atanh,acoth:x=>Math.atanh(1/x),asech:x=>Math.acosh(1/x),acsch:x=>Math.asinh(1/x)};
  const HALT=Symbol('stop'),BREAK=Symbol('break'),CONTINUE=Symbol('continue');
  class PreviewError extends Error{constructor(message,block){super(message);this.blockId=block?.id;}}
  class Runtime{
    constructor(emit,options={}){
      this.traceEnabled=Boolean(options.trace);this.providers=new Map();this.traceNodes=new Map();this.traceDirty=new Map();
      this.emit=emit;this.limit=options.limit||2000000;this.language=options.language||'python';
      this.devices=new Devices(emit);
      this.vars=new Map();this.tables=new Map();this.complex=new Map();this.booleans=new Map();this.functions=new Map();
      this.active=true;this.steps=0;this.row=1;this.column=1;this.font=12;this.precision={screen:2,console:2};
      this.buttons={check:false,left:false,right:false};this.handlers=[];this.timers=[];this.started=Date.now();
    }
    spend(b){if(!this.active)throw HALT;if(++this.steps>this.limit)throw new PreviewError('Preview operation limit reached. Stop long loops or simplify the program.',b);}
    unsupported(b){throw new PreviewError(`“${b.type}” is not supported by the offline screen preview. Raw code and physical devices are not executed.`,b);}
    draw(op,values={}){this.emit({type:'draw',op,...values});}
    format(value,where){
      if(value&&typeof value==='object'&&'re'in value)return `${value.re}${value.im<0?'':'+'}${value.im}i`;
      if(typeof value==='boolean')return this.language==='python'?(value?'True':'False'):String(Number(value));
      const p=this.precision[where];return typeof value==='number'&&p>=0&&Number.isFinite(value)?value.toFixed(p):String(value);
    }
    print(value,newline=false,precision=false){const text=precision?this.format(value,'screen'):String(value);this.draw('text',{text,x:(this.column-1)*this.font*.6,y:this.row*this.font});this.column+=text.length;if(newline){this.row++;this.column=1;}}
    record(b,values={}){
      if(!this.traceEnabled||!b?.id)return;
      let node=this.traceNodes.get(b.id);if(!node){if(this.traceNodes.size>=5000)return;node={id:b.id,count:0};this.traceNodes.set(b.id,node);}
      if(!values.update&&!values.branch&&!values.condition&&!values.error)node.count++;else if(!node.count)node.count=1;
      delete values.update;
      if(values.condition){const {input,value}=values.condition;node.conditions||={};node.conditions[input]||={true:0,false:0};node.conditions[input][String(value)]++;delete values.condition;}
      if('value'in values){const value=values.value;values.value=typeof value==='string'?value.slice(0,256):value;if(typeof value==='boolean')node[value?'trueCount':'falseCount']=(node[value?'trueCount':'falseCount']||0)+1;}
      if(values.branch){node.branches||={};node.branches[values.branch]=(node.branches[values.branch]||0)+1;delete values.branch;}
      Object.assign(node,values);this.traceDirty.set(b.id,node);
    }
    takeTrace(){const nodes=[...this.traceDirty.values()];this.traceDirty.clear();return nodes;}
    expr(b,x=NaN,depth=0){
      if(b?.disabled||b?.enabled===false)return 0;
      try{const value=this.evaluate(b,x,depth);const provider=b?.type==='iq_mb_argument'?this.providers.get('myarg:'+b.extraState?.definitionId+':'+b.extraState?.paramId):b?.type==='variables_get'?this.providers.get('var:'+variable(b)):b?.type==='iqv_bool_get'?this.providers.get('bool:'+field(b,'NAME')):b?.type==='iqm_complex_get'?this.providers.get('complex:'+field(b,'NAME')):undefined;this.record(b,{value,provider});return value;}
      catch(error){if(error instanceof Error){if(!error.blockId)error.blockId=b?.id;this.record(b,{error:error.message});}throw error;}
    }
    evaluate(b,x=NaN,depth=0){
      if(!b)return 0;this.spend(b);if(depth>100)throw new PreviewError('Expression nesting is too deep.',b);
      const f=(n,d)=>field(b,n,d),v=(n,d=0)=>child(b,n)?this.expr(child(b,n),x,depth+1):d,t=b.type;
      if(t==='math_number')return Number(f('NUM',0));
      if(t==='text')return String(f('TEXT'));
      if(t==='logic_boolean')return f('BOOL')==='TRUE';
      if(t==='logic_null')return null;
      if(t==='iq_mb_argument'){const a=b.extraState||{};return this.vars.get('myarg:'+a.definitionId+':'+a.paramId)??(a.kind==='boolean'?false:0);}
      if(t==='variables_get')return this.vars.get(variable(b))??0;
      if(t==='text_join')return Array.from({length:Math.min(100,b.extraState?.itemCount??2)},(_,i)=>String(v('ADD'+i,''))).join('');
      if(t==='logic_negate')return !v('BOOL',false);
      if(t==='logic_operation')return f('OP')==='AND'?Boolean(v('A',false)&&v('B',false)):Boolean(v('A',false)||v('B',false));
      if(t==='logic_compare')return compare(v('A'),({EQ:'==',NEQ:'!=',LT:'<',LTE:'<=',GT:'>',GTE:'>='})[f('OP')],v('B'));
      if(t==='logic_ternary')return v('IF',false)?v('THEN'):v('ELSE');
      if(t==='math_arithmetic'){const a=Number(v('A')),c=Number(v('B'));return ({ADD:()=>a+c,MINUS:()=>a-c,MULTIPLY:()=>a*c,DIVIDE:()=>a/c,POWER:()=>Math.pow(a,c)})[f('OP')]();}
      if(t==='math_single'){const a=v('NUM');return ({ROOT:Math.sqrt,ABS:Math.abs,NEG:x=>-x,LN:Math.log,LOG10:Math.log10,EXP:Math.exp,POW10:x=>10**x})[f('OP')](a);}
      if(t==='math_trig'){const a=v('NUM'),op=f('OP');return ['SIN','COS','TAN'].includes(op)?Math[op.toLowerCase()](a*Math.PI/180):Math[op.toLowerCase()](a)*180/Math.PI;}
      if(t==='math_constant')return ({PI:Math.PI,E:Math.E,GOLDEN_RATIO:(1+Math.sqrt(5))/2,SQRT2:Math.SQRT2,SQRT1_2:Math.SQRT1_2,INFINITY:Infinity})[f('CONSTANT')];
      if(t==='math_round')return ({ROUND:away,ROUNDUP:Math.ceil,ROUNDDOWN:Math.floor})[f('OP')](v('NUM'));
      if(t==='math_modulo'||t==='iqv_remainder'){const a=v(t==='math_modulo'?'DIVIDEND':'A'),c=v(t==='math_modulo'?'DIVISOR':'B');return ((a%c)+c)%c;}
      if(t==='math_random_float')return Math.random();
      if(t==='math_random_int'){const a=Math.ceil(v('FROM')),c=Math.floor(v('TO'));return a+Math.floor(Math.random()*(c-a+1));}
      if(t==='iq_bitop'){const a=v('A')|0,c=v('B')|0;return ({'&':()=>a&c,'|':()=>a|c,'^':()=>a^c,'<<':()=>a<<c,'>>':()=>a>>c})[f('OP')]();}
      if(['iqm_unary','iqm_trig','iqm_hyper'].includes(t)){const a=v('X'),r=REAL[f('OP')](a);return Number.isFinite(a)&&!Number.isFinite(r)?NaN:r;}
      if(t==='iqm_power')return Math.pow(v('A'),v('B'));
      if(t==='iqm_root'){const a=v('X'),n=v('N');return n===0||!Number.isFinite(n)?NaN:a<0&&Number.isInteger(n)&&n%2?-Math.pow(-a,1/n):Math.pow(a,1/n);}
      if(t==='iqm_round'){const scale=10**Math.max(-12,Math.min(12,Math.trunc(v('DIGITS'))));return [away,Math.floor,Math.ceil,Math.trunc][Number(f('MODE',0))](v('X')*scale)/scale;}
      if(t==='iqm_angle')return v('X')*(f('MODE')==='0'?Math.PI/180:180/Math.PI);
      if(t==='iqm_atan2')return Math.atan2(v('Y'),v('X'));
      if(t==='iqm_constant')return ({inf:Infinity,'-inf':-Infinity,nan:NaN})[f('VALUE')]??Number(f('VALUE'));
      if(t==='iqm_x')return x;
      if(t==='iqm_compare')return compare(v('A'),f('OP'),v('B'));
      if(t==='iqm_between')return compare(v('A'),f('LEFT'),v('X'))&&compare(v('X'),f('RIGHT'),v('B'));
      if(t==='iqm_near')return Math.abs(v('A')-v('B'))<=v('T');
      if(t==='iqm_finite'){const a=v('X');return [Number.isFinite(a),!Number.isFinite(a)&&!Number.isNaN(a),Number.isNaN(a),Number.isInteger(a)][Number(f('MODE',0))];}
      if(['iqm_integral','iqm_derivative','iqm_series'].includes(t)){
        const fn=a=>this.expr(child(b,'F'),a,depth+1),a=v('A'),c=v('B');
        if(t==='iqm_derivative'){const at=v('X'),h=v('H',.01);if(!Number.isFinite(at)||!Number.isFinite(h)||h<=0||at+h===at||at-h===at)return NaN;return f('ORDER')==='2'?(fn(at+h)-2*fn(at)+fn(at-h))/(h*h):(fn(at+h)-fn(at-h))/(2*h);}
        if(![a,c].every(Number.isFinite))return NaN;
        if(t==='iqm_series'){if(!Number.isSafeInteger(a)||!Number.isSafeInteger(c)||c-a+1>4096)return NaN;const product=f('MODE')==='1';let sum=product?1:0;for(let k=a;k<=c;k++)sum=product?sum*fn(k):sum+fn(k);return sum;}
        let n=v('N',128);if(!Number.isFinite(n)||n<2||n>1024)return NaN;n=Math.trunc(n);if(n%2)n++;if(a===c)return 0;const h=(c-a)/n;let sum=fn(a)+fn(c);for(let k=1;k<n;k++)sum+=(k%2?4:2)*fn(a+k*h);return sum*h/3;
      }
      if(t==='iqm_complex')return {re:v('RE'),im:v('IM')};
      if(t==='iqm_i')return {re:0,im:1};
      if(t==='iqm_complex_get')return this.complex.get(f('NAME'))||z(0);
      if(t==='iqm_complex_op'){const a=z(v('A')),c=z(v('B'));return [()=>add(a,c),()=>add(a,mul(c,z(-1))),()=>mul(a,c),()=>div(a,c),()=>exp(mul(c,ln(a)))][Number(f('OP',0))]();}
      if(t==='iqm_complex_fn')return COMPLEX[Number(f('OP',0))](z(v('Z')));
      if(t==='iqm_component'){const a=z(v('Z'));return [a.re,a.im,Math.hypot(a.re,a.im),Math.atan2(a.im,a.re)][Number(f('PART',0))];}
      if(t==='iq_b_button')return this.buttons.check;
      if(t==='iq_b_battery')return 100;
      if(t==='iq_b_row')return this.row;
      if(t==='iq_b_column')return this.column;
      if(t==='iq_b_timer')return (Date.now()-this.started)/(f('U')==='SECONDS'?1000:1);
      if(t==='iqv_bool_get')return this.booleans.get(f('NAME'))||false;
      if(t==='iqv_join')return String(v('A'))+String(v('B'));
      if(t==='iqv_to_text')return String(v('VALUE'));
      if(t==='iqv_to_number'){const a=v('VALUE','');return String(a).trim()===''?NaN:Number(a);}
      if(t==='iqv_letter'){const i=v('INDEX'),s=String(v('TEXT',''));return Number.isInteger(i)&&i>=1?s[i-1]||'':'';}
      if(t==='iqv_length')return String(v('TEXT','')).length;
      if(t==='iqv_contains')return String(v('TEXT','')).includes(String(v('PART','')));
      if(t==='iqv_map'){const a=v('A'),c=v('B');return a===c?NaN:v('C')+(v('X')-a)*(v('D')-v('C'))/(c-a);}
      if(t==='iqv_clamp')return Math.max(v('LO'),Math.min(v('HI'),v('X')));
      if(t==='iqv_deadband')return Math.abs(v('X'))<=Math.abs(v('LIMIT'))?0:v('X');
      const get=t.match(/^iqv_table_get([12])_(number|text)$/),size=t.match(/^iqv_table_size([12])$/);
      if(get){const table=this.tables.get(f('NAME'))||[],r=get[1]==='1'?1:v('ROW'),c=v('COL'),value=Number.isInteger(r)&&Number.isInteger(c)?table[r-1]?.[c-1]??'':'';return get[2]==='text'?String(value):String(value).trim()===''?NaN:Number(value);}
      if(size){const table=this.tables.get(f('NAME'))||[];return size[1]==='2'&&f('AXIS')==='rows'?table.length:table[0]?.length||0;}
      const device=this.devices.expression(b,v,f);if(device)return device.value;
      return this.unsupported(b);
    }
    async sleep(ms){const end=Date.now()+Math.max(0,Math.min(3600000,Number(ms)||0));do{if(!this.active)throw HALT;await new Promise(r=>setTimeout(r,Math.min(25,Math.max(0,end-Date.now()))));}while(Date.now()<end);}
    async loop(body,update,condition){while(condition()){try{await body();}catch(error){if(error===BREAK)break;if(error!==CONTINUE)throw error;}if(update)update();await this.sleep(0);}}
    async stack(block){for(let b=block;b;b=b.next?.block){if(b.disabled||b.enabled===false)continue;this.spend(b);if(this.steps%50===0)await this.sleep(0);this.record(b);try{await this.statement(b);}catch(error){if(error instanceof Error){if(!error.blockId)error.blockId=b.id;this.record(b,{error:error.message});}throw error;}}}
    async statement(b){
      const f=(n,d)=>field(b,n,d),v=(n,d=0)=>child(b,n)?this.expr(child(b,n)):d,body=n=>{this.record(b,{branch:n});return this.stack(child(b,n));},t=b.type;
      const condition=(name,defaultValue=false)=>{const value=Boolean(v(name,defaultValue));this.record(b,{condition:{input:name,value}});return value;};
      if(t==='iq_when_started'||t==='iqv_comment')return;
      if(t==='iq_print'){this.print(v('TEXT',''));return;}
      if(t==='iqm_print_complex'){this.print(this.format(z(v('Z')),'screen'));return;}
      if(t==='iq_clear'){this.draw('clear');this.row=this.column=1;return;}
      if(t==='iq_cursor'){this.row=Math.max(1,Math.trunc(v('ROW',1)));this.column=Math.max(1,Math.trunc(v('COL',1)));return;}
      if(t==='iq_l_next_row'){this.row++;this.column=1;return;}
      if(t==='iq_l_clear_row'){this.draw('clearRow',{y:(v('R',1)-1)*this.font,h:this.font});return;}
      if(t==='iq_l_pen'||t==='iq_l_fill'){this.draw(t==='iq_l_pen'?'pen':'fill',{colour:f('C')});return;}
      if(t==='iq_l_pen_width'){this.draw('width',{value:v('W',1)});return;}
      if(t==='iq_l_font'){this.font=Number(String(f('F')).match(/\d+/)?.[0]||12);this.draw('font',{height:this.font,proportional:String(f('F')).includes('PROP')});return;}
      const shapes={iq_l_pixel:['pixel',['X','Y']],iq_l_line:['line',['X','Y','X2','Y2']],iq_l_rect:['rect',['X','Y','W','H']],iq_l_circle:['circle',['X','Y','R']],iqm_origin:['origin',['X','Y']],iqm_clip:['clip',['X','Y','W','H']],iqm_text:['text',['X','Y']]};
      if(shapes[t]){const [op,names]=shapes[t],values=Object.fromEntries(names.map(n=>[n.toLowerCase(),Math.trunc(v(n))]));if(t==='iqm_text')values.text=String(v('TEXT',''));this.draw(op,values);return;}
      if(t==='iqm_render'){this.emit({type:'render'});return;}
      if(t==='iqm_rgb'){this.draw(f('TARGET'),{colour:`rgb(${['R','G','B'].map(n=>Math.max(0,Math.min(255,Math.trunc(v(n))))).join(',')})`});return;}
      if(['iqm_arc','iqm_ellipse','iqm_triangle'].includes(t)){
        if(t==='iqm_triangle'){this.draw('path',{points:[[v('X1'),v('Y1')],[v('X2'),v('Y2')],[v('X3'),v('Y3')],[v('X1'),v('Y1')]]});return;}
        const cx=v('X'),cy=v('Y'),rx=Math.abs(v(t==='iqm_arc'?'R':'RX')),ry=Math.abs(v(t==='iqm_arc'?'R':'RY')),a=t==='iqm_arc'?v('START'):0,span=t==='iqm_arc'?Math.max(-360,Math.min(360,v('END')-a)):360;
        this.draw('path',{points:Array.from({length:73},(_,i)=>[cx+rx*Math.cos((a+span*i/72)*Math.PI/180),cy+ry*Math.sin((a+span*i/72)*Math.PI/180)])});return;
      }
      if(t==='iqm_axes'||t==='iqm_graph'){
        const [xmin,xmax,ymin,ymax]=['XMIN','XMAX','YMIN','YMAX'].map(n=>v(n));
        if(![xmin,xmax,ymin,ymax,xmax-xmin,ymax-ymin].every(Number.isFinite)||xmax<=xmin||ymax<=ymin)return;
        this.draw('origin',{x:0,y:0});this.draw('clip',{x:0,y:0,w:160,h:108});
        if(t==='iqm_axes'){
          if(xmin<=0&&xmax>=0){const x=Math.trunc(-xmin/(xmax-xmin)*159);this.draw('line',{x,y:0,x2:x,y2:107});}
          if(ymin<=0&&ymax>=0){const y=Math.trunc(ymax/(ymax-ymin)*107);this.draw('line',{x:0,y,x2:159,y2:y});}return;
        }
        let previous;
        for(let px=0;px<160;px++){
          const value=this.expr(child(b,'F'),xmin+(xmax-xmin)*px/159);
          if(!Number.isFinite(value)||value<ymin||value>ymax){previous=null;continue;}
          const py=Math.trunc((ymax-value)/(ymax-ymin)*107);
          if(previous&&Math.abs(py-previous.y)<54)this.draw('line',{x:previous.x,y:previous.y,x2:px,y2:py});else this.draw('pixel',{x:px,y:py});
          previous={x:px,y:py};
        }return;
      }
      if(t==='variables_set'||t==='math_change'){const key=variable(b);this.vars.set(key,t==='math_change'?(this.vars.get(key)||0)+v('DELTA'):v('VALUE'));this.providers.set('var:'+key,b.id);this.record(b,{value:this.vars.get(key),update:true});return;}
      if(t==='iqm_complex_set'){this.complex.set(f('NAME'),z(v('Z')));this.providers.set('complex:'+f('NAME'),b.id);this.record(b,{value:this.complex.get(f('NAME')),update:true});return;}
      if(t==='iqv_bool_set'){this.booleans.set(f('NAME'),Boolean(v('VALUE',false)));this.providers.set('bool:'+f('NAME'),b.id);this.record(b,{value:this.booleans.get(f('NAME')),update:true});return;}
      if(t==='controls_if'){const conditionValue=condition;for(const condition of Object.keys(b.inputs||{}).filter(n=>/^IF\d+$/.test(n)).sort((a,b)=>Number(a.slice(2))-Number(b.slice(2))))if(conditionValue(condition)){const path='DO'+condition.slice(2);await body(path);return;}await body('ELSE');return;}
      if(t==='controls_repeat_ext'){let i=0;const n=Math.max(0,Math.trunc(v('TIMES')));await this.loop(()=>body('DO'),()=>i++,()=>i<n);return;}
      if(['controls_whileUntil','iqv_forever','iqv_repeat_until'].includes(t)){await this.loop(()=>body('DO'),null,()=>t==='iqv_forever'?true:t==='iqv_repeat_until'?!condition('COND'):condition('BOOL')===(f('MODE')==='WHILE'));return;}
      if(t==='controls_for'){const key=variable(b),a=v('FROM'),to=v('TO'),step=Math.abs(v('BY',1))*(a<=to?1:-1);if(!Number.isFinite(step)||step===0)throw new PreviewError('For-loop step must be finite and nonzero.',b);this.vars.set(key,a);this.providers.set('var:'+key,b.id);await this.loop(()=>body('DO'),()=>this.vars.set(key,this.vars.get(key)+step),()=>step>0?this.vars.get(key)<=to:this.vars.get(key)>=to);return;}
      if(t==='controls_flow_statements')throw f('FLOW')==='BREAK'?BREAK:CONTINUE;
      if(t==='iq_wait'||t==='iq_wait_units'){await this.sleep(v(t==='iq_wait'?'SECS':'T',1)*(t==='iq_wait'||f('U')==='SECONDS'?1000:1));return;}
      if(t==='iq_wait_until'){await this.loop(()=>this.sleep(5),null,()=>!condition('C'));return;}
      if(t==='iqv_stop_project'){this.stop();throw HALT;}
      if(t==='iq_b_timer_clear'){this.started=Date.now();return;}
      if(t==='iqv_console_precision'||t==='iqv_screen_precision'){this.precision[t.includes('console')?'console':'screen']=Number(f('DIGITS',2));return;}
      if(t==='iqv_screen_print'){this.print(v('VALUE'),f('NEWLINE')==='yes',true);return;}
      if(t==='iqv_print'||t==='iq_l_console_print'){this.emit({type:'console',text:(t==='iqv_print'?this.format(v('VALUE'),'console'):String(v('T','')))+(t==='iq_l_console_print'||f('NEWLINE')==='yes'?'\n':'')});return;}
      if(t==='iqv_newline'){this.emit({type:'console',text:'\n'});return;}
      if(t==='iqv_clear'||t==='iq_l_console_clear'){this.emit({type:'console-clear'});return;}
      if(t==='iqv_color'){this.emit({type:'console-colour',value:f('COLOR')});return;}
      if(t==='iq_mb_call'){
        const s=b.extraState||{},fn=this.functions.get('myblock:'+s.definitionId);if(!fn)throw new PreviewError('My Block definition is missing: '+s.name,b);
        if((this.myBlockDepth||0)>=100)throw new PreviewError('My Block recursion exceeded 100 calls.',b);
        const ps=(fn.extraState?.parts||[]).filter(p=>p.kind!=='label'),values=ps.map((p,i)=>p.kind==='boolean'?Boolean(v('ARG'+i,false)):Number(v('ARG'+i))),keys=ps.map(p=>'myarg:'+fn.id+':'+p.id),saved=keys.map(key=>[key,this.vars.has(key),this.vars.get(key),this.providers.get(key)]);
        keys.forEach((key,i)=>{this.vars.set(key,values[i]);this.providers.set(key,child(b,'ARG'+i)?.id);this.record(child(fn,'PARAM'+i),{value:values[i]});});this.myBlockDepth=(this.myBlockDepth||0)+1;this.record(fn);
        try{await this.stack(fn.next?.block);}finally{this.myBlockDepth--;for(const[key,existed,value,provider]of saved){existed?this.vars.set(key,value):this.vars.delete(key);provider?this.providers.set(key,provider):this.providers.delete(key);}}return;
      }
      if(t==='procedures_defnoreturn'){this.functions.set(f('NAME'),b);return;}
      if(t==='procedures_callnoreturn'){
        const name=b.extraState?.name||f('NAME'),fn=this.functions.get(name);if(!fn)throw new PreviewError('Procedure not found: '+name,b);
        const params=fn.extraState?.params||[],saved=params.map(p=>[p.id||p.name,this.vars.has(p.id||p.name),this.vars.get(p.id||p.name)]),values=params.map((_,i)=>v('ARG'+i));
        params.forEach((p,i)=>this.vars.set(p.id||p.name,values[i]));
        try{await this.stack(child(fn,'STACK'));}finally{for(const[key,existed,value]of saved)existed?this.vars.set(key,value):this.vars.delete(key);}return;
      }
      const create=t.match(/^iqv_table_create([12])$/),set=t.match(/^iqv_table_set([12])$/);
      if(create){const r=create[1]==='1'?1:v('ROWS'),c=v('COLS'),fill=String(v('FILL'));this.tables.set(f('NAME'),Number.isInteger(r)&&Number.isInteger(c)&&r>=0&&c>=0&&r<=64&&c<=64?Array.from({length:r},()=>Array(c).fill(fill)):[]);return;}
      if(set){const a=this.tables.get(f('NAME'))||[],r=set[1]==='1'?1:v('ROW'),c=v('COL');if(Number.isInteger(r)&&Number.isInteger(c)&&r>=1&&c>=1&&r<=a.length&&c<=(a[0]?.length||0))a[r-1][c-1]=String(v('VALUE'));return;}
      if(t==='iqv_list_items'||t==='iqv_matrix_items'){const a=['A','B','C',...(t==='iqv_matrix_items'?['D']:[])].map(n=>String(v(n)));this.tables.set(f('NAME'),t==='iqv_list_items'?[a]:[a.slice(0,2),a.slice(2)]);return;}
      if(await this.devices.statement(this,b,v,f)!==undefined)return;
      this.unsupported(b);
    }
    stop(){this.active=false;for(const timer of this.timers)clearTimeout(timer);}
    fail(error){if(error===HALT)return;this.stop();this.emit({type:'error',message:error.message||'Invalid control flow outside a loop.',blockId:error.blockId});}
    press(name,down){const changed=this.buttons[name]!==down;this.buttons[name]=down;if(!changed||!this.active)return;if(name==='check')for(const b of this.handlers.filter(b=>b.type===(down?'iq_ev_brain_pressed':'iq_ev_brain_released'))){this.record(b);this.record(b,{branch:'DO'});this.stack(child(b,'DO')).catch(error=>this.fail(error));}}
    async run(state){
      const blocks=state.blocks?.blocks||[];
      try{this.devices.scan(blocks);}catch(error){this.fail(error);return;}
      for(const b of blocks){if(b.disabled||b.enabled===false)continue;if(b.type==='iq_mb_define')this.functions.set('myblock:'+b.id,b);if(b.type==='procedures_defnoreturn')this.functions.set(field(b,'NAME'),b);if(['iq_ev_brain_pressed','iq_ev_brain_released','iq_ev_brain_timer'].includes(b.type))this.handlers.push(b);}
      for(const b of this.handlers.filter(b=>b.type==='iq_ev_brain_timer'))this.timers.push(setTimeout(()=>{if(this.active){this.record(b);this.record(b,{branch:'DO'});this.stack(child(b,'DO')).catch(error=>this.fail(error));}},Math.max(0,Number(field(b,'N',1000)))));
      try{
        for(const b of blocks){if(b.disabled||b.enabled===false||this.handlers.includes(b)||(b.type.startsWith('procedures_def')||b.type==='iq_mb_define'))continue;await this.stack(b);}
        this.emit({type:'finished',interactive:this.handlers.length>0});
      }catch(error){if(error===HALT)this.emit({type:'stopped'});else this.fail(error);}
    }
  }
  const api={Runtime,PreviewError,child};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.IQSimulatorCore=api;
})(typeof self!=='undefined'?self:globalThis);
