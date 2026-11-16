// Original IQ Raw miniatures. Notes use IQ2's seven natural-note indices.
(function(root){
  const recipes={
    ROBOT_HELLO:{label:'Robot hello',notes:[[3,0,90,35],[3,4,90,100],[4,0,160,0]]},
    BUBBLE_POP:{label:'Bubble pop',notes:[[3,1,40,15],[4,3,45,10],[4,6,55,0]]},
    LASER_ZAP:{label:'Laser zap',notes:[[4,6,30,0],[4,5,30,0],[4,3,30,0],[4,1,40,0],[3,5,45,0],[3,2,70,0],[3,0,100,0]]},
    SPARKLE:{label:'Sparkle',notes:[[4,0,55,20],[4,4,55,20],[4,2,55,20],[4,6,55,20],[4,4,140,0]]},
    QUEST_START:{label:'Quest start',notes:[[3,1,100,30],[3,3,70,20],[3,5,100,80],[4,1,180,30],[4,4,250,0]]},
    LEVEL_UP:{label:'Level up',notes:[[3,2,75,15],[3,4,75,15],[3,6,75,15],[4,1,75,15],[4,4,220,0]]},
    VICTORY_LAP:{label:'Victory lap',notes:[[4,0,90,20],[3,4,90,20],[4,2,130,30],[4,1,80,20],[4,3,80,20],[4,0,280,0]]},
    OOPS:{label:'Oops',notes:[[4,1,100,30],[3,6,120,30],[3,3,250,0]]},
    LOW_BATTERY:{label:'Low battery',notes:[[3,2,110,80],[3,2,110,80],[3,0,300,0]]},
    COUNTDOWN:{label:'Countdown',notes:[[3,4,80,220],[3,4,80,220],[4,0,260,0]]},
    RAIN_DROPS:{label:'Rain drops',notes:[[4,5,55,120],[4,1,65,80],[4,6,45,160],[4,3,80,60],[3,5,100,0]]},
    DIGITAL_DOORBELL:{label:'Digital doorbell',notes:[[4,2,180,40],[4,0,280,140],[3,4,100,20],[4,0,220,0]]},
  };
  const natural=[0,2,4,5,7,9,11];
  const key=value=>String(value).replace(/^IQRawSound\./,'');
  const get=value=>recipes[key(value)];
  const duration=value=>get(value)?.notes.reduce((total,[,,ms,gap])=>total+ms+gap,0)||0;
  function timeline(value){let at=0;return (get(value)?.notes||[]).map(([octave,note,ms,gap])=>{const hz=440*2**(((octave+1)*12+natural[note]-69)/12),part=[at/1000,ms/1000,hz,hz,'triangle'];at+=ms+gap;return part;});}
  function generate(lang,value,brain,g){
    const sound=get(value);if(!sound)throw Error('Unknown IQ Raw sound: '+value);
    const fn='iqraw_sound_'+key(value).toLowerCase(),body=sound.notes.map(([octave,note,ms,gap])=>lang==='py'?`    brain.play_note(${octave}, ${note}, ${ms})\n`+(gap?`    wait(${gap}, MSEC)\n`:''):`    brain.playNote(${octave}, ${note}, ${ms});\n`+(gap?`    vex::wait(${gap}, vex::msec);\n`:'' )).join('');
    g.definitions_[fn]=lang==='py'?`def ${fn}(brain):\n${body}`:`void ${fn}(vex::brain &brain) {\n${body}}\n`;
    if(lang==='cpp'&&!g.protos_.includes(`void ${fn}(vex::brain &brain);`))g.protos_.push(`void ${fn}(vex::brain &brain);`);
    return fn+'('+brain+')'+(lang==='cpp'?';\n':'\n');
  }
  const api={recipes,get,key,duration,timeline,generate};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.IQRawSounds=api;
})(typeof self!=='undefined'?self:globalThis);
