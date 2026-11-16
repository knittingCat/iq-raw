// Simulated motors, drivetrain and sound for the offline preview. Shared by the block interpreter and the Python engine.
// It only keeps state and emits messages ({type:'motor'} and {type:'sound'}); the page draws the motors and plays the audio.
(function(root){
  const originalSounds=typeof module!=='undefined'&&module.exports?require('./iq-sounds'):root.IQRawSounds;
  const DEG_PER_SEC_PER_PERCENT=6; // IQ smart motor: 100% is about 100 rpm
  const toPercent=(v,unit)=>{v=Number(v);if(!Number.isFinite(v))return 0;const u=String(unit||'PERCENT').toUpperCase().replace(/^.*\./,'');return u==='RPM'?v:u==='DPS'?v/DEG_PER_SEC_PER_PERCENT:u==='VOLT'||u==='VOLTS'?v/12*100:v;};
  const fromPercent=(p,unit)=>{const u=String(unit||'PERCENT').toUpperCase().replace(/^.*\./,'');return u==='RPM'?p:u==='DPS'?p*DEG_PER_SEC_PER_PERCENT:p;};
  const toDegrees=(v,unit)=>Number(v)*(/TURN/i.test(String(unit))?360:1);
  const fromDegrees=(d,unit)=>/TURN/i.test(String(unit))?d/360:d;
  const toMm=(v,unit)=>Number(v)*(/INCH/i.test(String(unit))?25.4:1);
  const dirOf=d=>(d===-1||/REV|LEFT/i.test(String(d)))?-1:1;
  const clampPort=p=>{p=Math.trunc(Number(p));return p>=1&&p<=12?p:0;};
  const NOTE_NAMES=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

  class Devices{
    constructor(emit,now=()=>Date.now()){
      this.emit=emit;this.now=now;this.motors=new Map();this.drive=null;
    }
    // ---- motors ----
    motor(port,reversed){
      const p=clampPort(port);if(!p)throw new Error('Motor port must be 1 to 12, not '+port+'.');
      let m=this.motors.get(p);
      if(!m){m={port:p,reversed:false,velocity:50,dir:0,base:0,since:this.now(),target:null,stopping:'COAST'};this.motors.set(p,m);if(reversed!==undefined)m.reversed=Boolean(reversed);this.announce(m);}
      else if(reversed!==undefined&&Boolean(reversed)!==m.reversed){m.reversed=Boolean(reversed);this.announce(m);}
      return m;
    }
    sync(m){
      const t=this.now();
      if(m.dir){
        const rate=m.velocity*DEG_PER_SEC_PER_PERCENT,dist=rate*(t-m.since)/1000;
        if(m.target!==null&&dist>=Math.abs(m.target-m.base)){m.base=m.target;m.dir=0;m.target=null;}
        else m.base+=m.dir*dist;
      }
      m.since=t;return m;
    }
    announce(m){this.emit({type:'motor',port:m.port,reversed:m.reversed,position:m.base,rate:m.dir*m.velocity*DEG_PER_SEC_PER_PERCENT,limit:m.target,velocity:m.velocity,stopping:m.stopping,t:m.since});}
    // Starts a motor. Returns how long a move to a target takes, in milliseconds.
    motorSpin(port,dir,velocity,unit){
      const m=this.sync(this.motor(port));if(velocity!==undefined&&velocity!==null)m.velocity=Math.max(0,Math.min(100,toPercent(velocity,unit)));
      m.dir=m.velocity>0?dirOf(dir):0;m.target=null;this.announce(m);return 0;
    }
    motorSpinFor(port,dir,amount,unit,velocity,velocityUnit){
      const m=this.sync(this.motor(port));if(velocity!==undefined&&velocity!==null)m.velocity=Math.max(0,Math.min(100,toPercent(velocity,velocityUnit)));
      const deg=Math.abs(toDegrees(amount,unit));if(!Number.isFinite(deg)||deg===0||m.velocity<=0){m.dir=0;m.target=null;this.announce(m);return 0;}
      const d=dirOf(dir);m.dir=d;m.target=m.base+d*deg;this.announce(m);return deg/(m.velocity*DEG_PER_SEC_PER_PERCENT)*1000;
    }
    motorSpinTo(port,position,unit,velocity,velocityUnit){
      const m=this.sync(this.motor(port));const goal=toDegrees(position,unit);
      return this.motorSpinFor(port,goal>=m.base?1:-1,Math.abs(goal-m.base),'DEGREES',velocity,velocityUnit);
    }
    motorStop(port){const m=this.sync(this.motor(port));m.dir=0;m.target=null;this.announce(m);}
    motorSetVelocity(port,v,unit){const m=this.sync(this.motor(port));m.velocity=Math.max(0,Math.min(100,toPercent(v,unit)));this.announce(m);}
    motorSetPosition(port,v,unit){const m=this.sync(this.motor(port));const old=m.base;m.base=toDegrees(v,unit);if(m.target!==null)m.target+=m.base-old;this.announce(m);}
    motorSetStopping(port,mode){const m=this.motor(port);m.stopping=String(mode).replace(/^.*\./,'').toUpperCase();this.announce(m);}
    motorPosition(port,unit){return fromDegrees(this.sync(this.motor(port)).base,unit);}
    motorVelocity(port,unit){const m=this.sync(this.motor(port));return m.dir?fromPercent(m.dir*m.velocity,unit):0;}
    motorIsSpinning(port){return this.sync(this.motor(port)).dir!==0;}
    motorIsDone(port){return this.sync(this.motor(port)).target===null;}
    // ---- drivetrain: two motors, a wheel travel and a track width ----
    driveSetup(left=1,leftReversed=false,right=6,rightReversed=true,travel=200,track=173,units='MM'){
      this.motor(left,leftReversed);this.motor(right,rightReversed);
      this.drive={left:clampPort(left),right:clampPort(right),travel:toMm(travel,units)||200,track:toMm(track,units)||173,driveVelocity:50,turnVelocity:50,turnOffset:0};
      return this.drive;
    }
    ensureDrive(){return this.drive||this.driveSetup();}
    driveSpin(leftDir,rightDir,velocity,deg){
      const d=this.ensureDrive();let wait=0;
      for(const [port,dir] of [[d.left,leftDir],[d.right,rightDir]]){
        wait=Math.max(wait,deg===undefined?this.motorSpin(port,dir,velocity,'PERCENT'):this.motorSpinFor(port,dir,deg,'DEGREES',velocity,'PERCENT'));
      }
      return wait;
    }
    driveDrive(dir){const d=this.ensureDrive();return this.driveSpin(dirOf(dir),dirOf(dir),d.driveVelocity);}
    driveFor(dir,distance,units){const d=this.ensureDrive();return this.driveSpin(dirOf(dir),dirOf(dir),d.driveVelocity,Math.abs(toMm(distance,units))/d.travel*360);}
    driveTurn(dir){const d=this.ensureDrive();const s=dirOf(dir);return this.driveSpin(s,-s,d.turnVelocity);}
    driveTurnFor(dir,angle,unit){const d=this.ensureDrive();const s=dirOf(dir);return this.driveSpin(s,-s,d.turnVelocity,Math.abs(toDegrees(angle,unit))*d.track/d.travel);}
    driveStop(){const d=this.ensureDrive();this.motorStop(d.left);this.motorStop(d.right);}
    driveSetVelocity(v,unit){this.ensureDrive().driveVelocity=Math.max(0,Math.min(100,toPercent(v,unit)));}
    driveSetTurnVelocity(v,unit){this.ensureDrive().turnVelocity=Math.max(0,Math.min(100,toPercent(v,unit)));}
    driveRotation(unit){const d=this.ensureDrive();const l=this.motorPosition(d.left,'DEGREES'),r=this.motorPosition(d.right,'DEGREES');return fromDegrees((l-r)/2*d.travel/d.track+d.turnOffset,unit);}
    driveHeading(unit){const h=((this.driveRotation('DEGREES')%360)+360)%360;return fromDegrees(h,unit);}
    driveSetRotation(v,unit){const d=this.ensureDrive();d.turnOffset=0;d.turnOffset=toDegrees(v,unit)-this.driveRotation('DEGREES');}
    driveSetHeading(v,unit){const d=this.ensureDrive();d.turnOffset+=toDegrees(v,unit)-this.driveHeading('DEGREES');}
    driveTurnToRotation(goal,unit){const delta=toDegrees(goal,unit)-this.driveRotation('DEGREES');return this.driveTurnFor(delta>=0?1:-1,Math.abs(delta),'DEGREES');}
    driveTurnToHeading(goal,unit){let delta=((toDegrees(goal,unit)-this.driveHeading('DEGREES'))%360+540)%360-180;return this.driveTurnFor(delta>=0?1:-1,Math.abs(delta),'DEGREES');}
    driveIsMoving(){const d=this.ensureDrive();return this.motorIsSpinning(d.left)||this.motorIsSpinning(d.right);}
    driveIsDone(){const d=this.ensureDrive();return this.motorIsDone(d.left)&&this.motorIsDone(d.right);}
    driveVelocity(unit){const d=this.ensureDrive();return (this.motorVelocity(d.left,unit)+this.motorVelocity(d.right,unit))/2;}
    // ---- sound ----
    playNote(octave,note,ms){
      octave=Math.trunc(Number(octave));note=Math.trunc(Number(note));ms=Number(ms);
      if(![octave,note,ms].every(Number.isFinite))return;
      if(note>=0&&note<=6)note=[0,2,4,5,7,9,11][note];
      this.emit({type:'sound',kind:'note',octave,note,ms:Math.max(0,Math.min(60000,ms)),name:NOTE_NAMES[((note%12)+12)%12]+octave});
    }
    playSound(name){this.emit({type:'sound',kind:'sound',name:String(name).replace(/^.*\./,'').toUpperCase()});}
    // ---- blocks ----
    // Every motor port a program mentions is attached before it runs, so the preview shows it even if it never moves.
    scan(blocks){
      const walk=b=>{
        if(!b||typeof b!=='object')return;
        if(Array.isArray(b)){b.forEach(walk);return;}
        const t=typeof b.type==='string'?b.type:'',f=b.fields||{},checked=v=>v===true||v==='TRUE';
        if(t==='iq_motor_setup')this.motor(f.PORT,checked(f.REV));
        else if(/^iq_(motor_|port_volts|m_)/.test(t)&&f.PORT!==undefined)this.motor(f.PORT);
        else if(t==='iq_dt_setup')this.driveSetup(f.LP,checked(f.LREV),f.RP,checked(f.RREV),f.TRAVEL,f.TRACK,f.UNITS);
        else if(/^iq_dt_/.test(t))this.ensureDrive();
        for(const k of Object.keys(b))if(k!=='type'&&typeof b[k]==='object')walk(b[k]);
      };
      walk(blocks);
    }
    // Runs a block if it belongs to a motor, drivetrain or sound; returns undefined for any other block.
    async statement(rt,b,v,f){
      const t=b.type;
      const wait=async ms=>{if(ms>0)await rt.sleep(ms);};
      const blocking=()=>String(f('W','True'))!=='False';
      switch(t){
        case 'iq_motor_setup':this.motor(f('PORT'),f('REV')===true||f('REV')==='TRUE');return true;
        case 'iq_motor_spin':this.motorSpin(f('PORT'),f('DIR'),v('SPEED',50),'PERCENT');return true;
        case 'iq_port_volts':this.motorSpin(f('PORT'),f('DIR'),v('VOLTS',6),'VOLT');return true;
        case 'iq_motor_spin_for':await wait(this.motorSpinFor(f('PORT'),f('DIR'),v('DEG',360),'DEGREES'));return true;
        case 'iq_motor_stop':this.motorStop(f('PORT'));return true;
        case 'iq_m_spin_dir':this.motorSpin(f('PORT'),f('D'));return true;
        case 'iq_m_set_velocity':this.motorSetVelocity(f('PORT'),v('V',50),f('U'));return true;
        case 'iq_m_set_stopping':this.motorSetStopping(f('PORT'),f('M'));return true;
        case 'iq_m_set_timeout':case 'iq_m_set_torque':this.motor(f('PORT'));return true;
        case 'iq_m_set_position':this.motorSetPosition(f('PORT'),v('V',0),f('U'));return true;
        case 'iq_m_spin_for_units':{const ms=this.motorSpinFor(f('PORT'),f('D'),v('V',90),f('U'));if(blocking())await wait(ms);return true;}
        case 'iq_m_spin_to_position':{const ms=this.motorSpinTo(f('PORT'),v('V',90),f('U'));if(blocking())await wait(ms);return true;}
        case 'iq_dt_setup':this.driveSetup(f('LP'),f('LREV')===true||f('LREV')==='TRUE',f('RP'),f('RREV')===true||f('RREV')==='TRUE',f('TRAVEL'),f('TRACK'),f('UNITS'));return true;
        case 'iq_dt_drive':this.driveDrive(f('D'));return true;
        case 'iq_dt_drive_for':{const ms=this.driveFor(f('D'),v('X',200),f('U'));if(blocking())await wait(ms);return true;}
        case 'iq_dt_set_drive_vel':this.driveSetVelocity(v('V',50),f('U'));return true;
        case 'iq_dt_set_turn_vel':this.driveSetTurnVelocity(v('V',50),f('U'));return true;
        case 'iq_dt_set_heading':this.driveSetHeading(v('V',0),'DEGREES');return true;
        case 'iq_dt_set_rotation':this.driveSetRotation(v('V',0),'DEGREES');return true;
        case 'iq_dt_set_stopping':case 'iq_dt_set_timeout':this.ensureDrive();return true;
        case 'iq_dt_stop':this.driveStop();return true;
        case 'iq_dt_turn':this.driveTurn(f('D'));return true;
        case 'iq_dt_turn_for':{const ms=this.driveTurnFor(f('D'),v('X',90),'DEGREES');if(blocking())await wait(ms);return true;}
        case 'iq_dt_turn_to_heading':{const ms=this.driveTurnToHeading(v('X',90),'DEGREES');if(blocking())await wait(ms);return true;}
        case 'iq_dt_turn_to_rotation':{const ms=this.driveTurnToRotation(v('X',90),'DEGREES');if(blocking())await wait(ms);return true;}
        case 'iq_s_note':this.playNote(v('O',4),v('N',0),v('D',500));return true;
        case 'iq_s_sound':this.playSound(f('S'));if(originalSounds.get(f('S')))await rt.sleep(originalSounds.duration(f('S')));return true;
      }
      return undefined;
    }
    // Returns {value} for a motor or drivetrain reporter block, or undefined for any other block.
    expression(b,v,f){
      switch(b.type){
        case 'iq_m_position':return {value:this.motorPosition(f('PORT'),f('U'))};
        case 'iq_m_velocity':return {value:this.motorVelocity(f('PORT'),f('U'))};
        case 'iq_m_current':return {value:this.motorIsSpinning(f('PORT'))?0.2:0};
        case 'iq_m_is_done':return {value:this.motorIsDone(f('PORT'))};
        case 'iq_m_is_spinning':return {value:this.motorIsSpinning(f('PORT'))};
        case 'iq_dt_heading':return {value:this.driveHeading('DEGREES')};
        case 'iq_dt_rotation':return {value:this.driveRotation('DEGREES')};
        case 'iq_dt_velocity':return {value:this.driveVelocity(f('U'))};
        case 'iq_dt_current':return {value:this.driveIsMoving()?0.4:0};
        case 'iq_dt_is_done':return {value:this.driveIsDone()};
        case 'iq_dt_is_moving':return {value:this.driveIsMoving()};
      }
      return undefined;
    }
  }
  const api={Devices,NOTE_NAMES};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.IQSimulatorDevices=api;
})(typeof self!=='undefined'?self:globalThis);
