// Plays the preview's notes and named brain sounds through the computer's speakers (Web Audio). Approximations, not the real recordings.
(function(root){
  const originalSounds=typeof module!=='undefined'&&module.exports?require('./iq-sounds'):root.IQRawSounds;
  const frequency=(octave,note)=>440*Math.pow(2,((12*(octave+1)+note)-69)/12);
  // Each named sound is a list of [start s, length s, from Hz, to Hz, wave].
  const SOUNDS={
    SIREN:[[0,.5,600,1000,'sawtooth'],[.5,.5,1000,600,'sawtooth'],[1,.5,600,1000,'sawtooth'],[1.5,.5,1000,600,'sawtooth']],
    SIREN2:[[0,.3,700,1100,'square'],[.3,.3,1100,700,'square'],[.6,.3,700,1100,'square'],[.9,.3,1100,700,'square']],
    WRONG_WAY:[[0,.25,300,300,'square'],[.3,.25,220,220,'square'],[.6,.4,160,160,'square']],
    WRONG_WAY_SLOW:[[0,.5,300,300,'square'],[.6,.5,220,220,'square'],[1.2,.8,160,160,'square']],
    FILLUP:[[0,1.2,300,1200,'triangle']],
    HEADLIGHTS_ON:[[0,.12,500,900,'sine'],[.14,.2,900,1300,'sine']],
    HEADLIGHTS_OFF:[[0,.12,1300,900,'sine'],[.14,.2,900,500,'sine']],
    TOLLBOOTH:[[0,.1,1500,1500,'sine'],[.15,.25,1000,1000,'sine']],
    ALARM:[[0,.2,1000,1000,'square'],[.3,.2,1000,1000,'square'],[.6,.2,1000,1000,'square'],[.9,.2,1000,1000,'square']],
    ALARM2:[[0,.15,1800,1800,'square'],[.2,.15,1400,1400,'square'],[.4,.15,1800,1800,'square'],[.6,.15,1400,1400,'square'],[.8,.15,1800,1800,'square']],
    TADA:[[0,.12,523,523,'triangle'],[.12,.12,659,659,'triangle'],[.24,.12,784,784,'triangle'],[.36,.6,1047,1047,'triangle']],
    DOOR_CLOSE:[[0,.15,200,80,'sine'],[.15,.1,120,60,'sine']],
    RATCHET:[[0,.04,900,900,'square'],[.09,.04,900,900,'square'],[.18,.04,900,900,'square'],[.27,.04,900,900,'square'],[.36,.04,900,900,'square']],
    RATCHET2:[[0,.03,1200,1200,'square'],[.06,.03,1200,1200,'square'],[.12,.03,1200,1200,'square'],[.18,.03,1200,1200,'square'],[.24,.03,1200,1200,'square'],[.30,.03,1200,1200,'square']],
    WRENCH:[[0,.06,1100,1100,'square'],[.1,.06,900,900,'square'],[.2,.06,1100,1100,'square'],[.3,.06,900,900,'square']],
    POWER_DOWN:[[0,.8,800,100,'sawtooth']],
  };
  class Audio{
    constructor(){this.nodes=new Set();this.ctx=null;this.next=0;this.muted=false;this.volume=.25;}
    // Browsers only allow sound after a click, so call this from the Run button.
    unlock(){
      try{
        const Ctor=root.AudioContext||root.webkitAudioContext;
        if(!Ctor)return false;
        this.ctx||=new Ctor();
        if(this.ctx.state==='suspended')this.ctx.resume();
        return true;
      }catch{return false;}
    }
    reset(){this.next=0;for(const node of this.nodes){try{node.stop();}catch{}}this.nodes.clear();}
    tone(start,length,from,to,wave='sine'){
      const ctx=this.ctx;if(!ctx||this.muted)return;
      const osc=ctx.createOscillator(),gain=ctx.createGain(),end=start+length;
      osc.type=wave;osc.frequency.setValueAtTime(from,start);if(to!==from)osc.frequency.linearRampToValueAtTime(to,end);
      gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(this.volume,start+Math.min(.01,length/4));
      gain.gain.setValueAtTime(this.volume,Math.max(start,end-.02));gain.gain.linearRampToValueAtTime(0,end);
      this.nodes.add(osc);osc.onended=()=>{this.nodes.delete(osc);osc.disconnect();gain.disconnect();};
      osc.connect(gain).connect(ctx.destination);osc.start(start);osc.stop(end+.02);
    }
    // Sounds queue one after another instead of piling on top of each other.
    play(message){
      if(!this.ctx||this.muted)return;
      const start=Math.max(this.ctx.currentTime+.02,this.next);
      if(message.kind==='note'){
        const length=Math.max(.02,message.ms/1000);
        this.tone(start,length,frequency(message.octave,message.note),frequency(message.octave,message.note),'triangle');
        this.next=start+length;return;
      }
      const parts=originalSounds.get(message.name)?originalSounds.timeline(message.name):SOUNDS[message.name]||SOUNDS.TADA;let end=start;
      for(const [at,length,from,to,wave] of parts){this.tone(start+at,length,from,to,wave);end=Math.max(end,start+at+length);}
      this.next=end;
    }
  }
  const api={Audio,frequency,SOUNDS};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.IQSimulatorAudio=api;
})(typeof self!=='undefined'?self:globalThis);
