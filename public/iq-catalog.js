// The rest of the VEXcode IQ (2nd gen) blocks, as a table. Each entry gives a block's label, its Python and its C++, and
// both generators are built from it. The Python forms follow the block docs in VEX's VS Code extension; the C++ forms are
// checked by compiling every block (see test/blocks.test.mjs). Needs Blockly, iq-blocks.js and iq-cpp.js loaded first.
(function () {
  const originalSounds=typeof module!=='undefined'&&module.exports?require('./iq-sounds'):globalThis.IQRawSounds;
  const py = Blockly.Python;
  const cp = Blockly.Cpp;
  const PORTS = Array.from({ length: 12 }, (_, i) => [String(i + 1), String(i + 1)]);

  // ---- argument shorthands ----
  const N = (name, def = 0) => ({ name, t: 'num', def });
  const T = (name, def = '') => ({ name, t: 'str', def });
  const BL = (name) => ({ name, t: 'bool' });
  const F = (name, def = 0) => ({ name, t: 'f', def }); // a number typed straight into the block
  const D = (name, opts) => ({ name, t: 'dd', opts });
  const DR = (name, opts) => ({ name, t: 'dd', opts, raw: true }); // dropdown whose value goes into the code unchanged
  const P = (name = 'PORT') => ({ name, t: 'port' });
  const DO = { name: 'DO', t: 'stmt' };

  const DIR = ['FORWARD', 'REVERSE'];
  const TURN = ['RIGHT', 'LEFT'];
  const TIME = ['SECONDS', 'MSEC'];
  const DIST = ['MM', 'INCHES'];
  const ROT = ['DEGREES', 'TURNS'];
  const VEL = ['PERCENT', 'RPM', 'VelocityUnits.DPS'];
  const DRIVEVEL = ['PERCENT', 'RPM'];
  const STOP = ['BRAKE', 'COAST', 'HOLD'];
  const AMP = ['CurrentUnits.AMP'];
  const WAIT = [['and wait', 'True'], ["don't wait", 'False']];
  const COLORS = ['RED', 'GREEN', 'BLUE', 'YELLOW', 'ORANGE', 'PURPLE', 'CYAN', 'WHITE', 'BLACK', 'TRANSPARENT', 'RED_VIOLET', 'VIOLET', 'BLUE_VIOLET', 'BLUE_GREEN', 'YELLOW_GREEN', 'YELLOW_ORANGE', 'RED_ORANGE'].map((c) => 'Color.' + c);
  const FONTS = ['MONO12', 'MONO15', 'MONO20', 'MONO30', 'MONO40', 'MONO60', 'PROP20', 'PROP30', 'PROP40'].map((f) => 'FontType.' + f);
  const SOUNDS = ['SIREN', 'WRONG_WAY', 'WRONG_WAY_SLOW', 'FILLUP', 'HEADLIGHTS_ON', 'HEADLIGHTS_OFF', 'TOLLBOOTH', 'ALARM', 'TADA', 'DOOR_CLOSE', 'RATCHET', 'WRENCH', 'SIREN2', 'RATCHET2', 'ALARM2', 'POWER_DOWN'].map((s) => 'SoundType.' + s).concat(Object.keys(originalSounds.recipes).map(s=>'IQRawSound.'+s));
  const AXES = ['AxisType.XAXIS', 'AxisType.YAXIS', 'AxisType.ZAXIS'];
  const ORIENT = ['OrientationType.PITCH', 'OrientationType.ROLL', 'OrientationType.YAW'];
  const GYROCAL = ['GyroCalibrationType.NORMAL', 'GyroCalibrationType.SLOW', 'GyroCalibrationType.EXTENDED'];
  const FADES = ['FadeType.SLOW', 'FadeType.FAST', 'FadeType.OFF'];
  const LED = ['LedStateType.ON', 'LedStateType.OFF'];
  const CAXIS = ['A', 'B', 'C', 'D'].map((a) => [a, a]);
  const CBTN = ['LUp', 'LDown', 'RUp', 'RDown', 'EUp', 'EDown', 'FUp', 'FDown', 'L3', 'R3'].map((b) => [b, b]);

  // ---- Python token -> C++ token ----
  const CPP_TOKEN = {
    'SoundType.WRONG_WAY': 'wrongWay', 'SoundType.WRONG_WAY_SLOW': 'wrongWaySlow', 'SoundType.HEADLIGHTS_ON': 'headlightsOn',
    'SoundType.HEADLIGHTS_OFF': 'headlightsOff', 'SoundType.TOLLBOOTH': 'tollBooth', 'SoundType.DOOR_CLOSE': 'doorClose', 'SoundType.POWER_DOWN': 'powerDown',
    'GyroCalibrationType.NORMAL': 'calNormal', 'GyroCalibrationType.SLOW': 'calSlow', 'GyroCalibrationType.EXTENDED': 'calExtended',
    'LedStateType.ON': 'ledState::on', 'LedStateType.OFF': 'ledState::off',
  };
  function cppToken(v) {
    if (CPP_TOKEN[v]) return CPP_TOKEN[v];
    if (/^Color\./.test(v)) return 'color::' + v.slice(6).toLowerCase();
    const m = v.match(/^[A-Za-z]+\.(.+)$/);
    return (m ? m[1] : v).toLowerCase();
  }
  const labelOf = (v) => String(v).startsWith('IQRawSound.')?'IQ Raw · '+originalSounds.get(v).label:String(v).replace(/^[A-Za-z]+\./, '').replace(/_/g, ' ').toLowerCase();

  // ---- the table ----
  // kind: s statement, n number, b true/false, x any, h hat (a stack that runs when something happens)
  // dev: which object {dev} stands for. py / cpp: the code, with {NAME} for each argument.
  const SPECS = [];
  const add = (cat, id, kind, msg, args, py, cpp, extra = {}) => SPECS.push({ cat, id: 'iq_' + id, kind, msg, args, py, cpp, ...extra });

  // Control
  add('Control', 'wait_units', 's', 'wait {T} {U}', [N('T', 1), D('U', TIME)], 'wait({T}, {U})', 'wait({T}, {U});');
  add('Control', 'wait_until', 's', 'wait until {C}', [BL('C')], 'while not ({C}):\n    wait(5, MSEC)', 'while (!({C})) {\n    wait(5, msec);\n}');

  // Drivetrain (the setup block is written by hand below)
  const DT = { dev: 'drivetrain' };
  add('Drivetrain', 'dt_drive', 's', 'drive {D}', [D('D', DIR)], '{dev}.drive({D})', '{dev}.drive({D});', DT);
  add('Drivetrain', 'dt_drive_for', 's', 'drive {D} for {X} {U} {W}', [D('D', DIR), N('X', 200), D('U', DIST), D('W', WAIT)], '{dev}.drive_for({D}, {X}, {U}, wait={W})', '{dev}.driveFor({D}, {X}, {U}, {W});', DT);
  add('Drivetrain', 'dt_set_drive_vel', 's', 'set drive velocity to {V} {U}', [N('V', 50), D('U', DRIVEVEL)], '{dev}.set_drive_velocity({V}, {U})', '{dev}.setDriveVelocity({V}, {U});', DT);
  add('Drivetrain', 'dt_set_turn_vel', 's', 'set turn velocity to {V} {U}', [N('V', 50), D('U', DRIVEVEL)], '{dev}.set_turn_velocity({V}, {U})', '{dev}.setTurnVelocity({V}, {U});', DT);
  add('Drivetrain', 'dt_set_heading', 's', 'set drive heading to {V} degrees', [N('V', 0)], '{dev}.set_heading({V}, DEGREES)', '{dev}.setHeading({V}, degrees);', DT);
  add('Drivetrain', 'dt_set_rotation', 's', 'set drive rotation to {V} degrees', [N('V', 0)], '{dev}.set_rotation({V}, DEGREES)', '{dev}.setRotation({V}, degrees);', DT);
  add('Drivetrain', 'dt_set_stopping', 's', 'set drive stopping to {M}', [D('M', STOP)], '{dev}.set_stopping({M})', '{dev}.setStopping({M});', DT);
  add('Drivetrain', 'dt_set_timeout', 's', 'set drive timeout to {V} seconds', [N('V', 1)], '{dev}.set_timeout({V}, SECONDS)', '{dev}.setTimeout({V}, seconds);', DT);
  add('Drivetrain', 'dt_stop', 's', 'stop driving', [], '{dev}.stop()', '{dev}.stop();', DT);
  add('Drivetrain', 'dt_turn', 's', 'turn {D}', [D('D', TURN)], '{dev}.turn({D})', '{dev}.turn({D});', DT);
  add('Drivetrain', 'dt_turn_for', 's', 'turn {D} for {X} degrees {W}', [D('D', TURN), N('X', 90), D('W', WAIT)], '{dev}.turn_for({D}, {X}, DEGREES, wait={W})', '{dev}.turnFor({D}, {X}, degrees, {W});', DT);
  add('Drivetrain', 'dt_turn_to_heading', 's', 'turn to heading {X} degrees {W}', [N('X', 90), D('W', WAIT)], '{dev}.turn_to_heading({X}, DEGREES, wait={W})', '{dev}.turnToHeading({X}, degrees, {W});', DT);
  add('Drivetrain', 'dt_turn_to_rotation', 's', 'turn to rotation {X} degrees {W}', [N('X', 90), D('W', WAIT)], '{dev}.turn_to_rotation({X}, DEGREES, wait={W})', '{dev}.turnToRotation({X}, degrees, {W});', DT);
  add('Drivetrain', 'dt_current', 'n', 'drive current {U}', [D('U', AMP)], '{dev}.current({U})', '{dev}.current({U})', DT);
  add('Drivetrain', 'dt_heading', 'n', 'drive heading in degrees', [], '{dev}.heading(DEGREES)', '{dev}.heading(degrees)', DT);
  add('Drivetrain', 'dt_is_done', 'b', 'drive is done?', [], '{dev}.is_done()', '{dev}.isDone()', DT);
  add('Drivetrain', 'dt_is_moving', 'b', 'drive is moving?', [], '{dev}.is_moving()', '{dev}.isMoving()', DT);
  add('Drivetrain', 'dt_rotation', 'n', 'drive rotation in degrees', [], '{dev}.rotation(DEGREES)', '{dev}.rotation(degrees)', DT);
  add('Drivetrain', 'dt_velocity', 'n', 'drive velocity {U}', [D('U', DRIVEVEL)], '{dev}.velocity({U})', '{dev}.velocity({U})', DT);

  // Motors (more than the four in iq-blocks.js)
  const M = { dev: 'motor' };
  add('Motors', 'm_spin_dir', 's', 'motor {PORT} spin {D}', [P(), D('D', DIR)], '{dev}.spin({D})', '{dev}.spin({D});', M);
  add('Motors', 'm_set_velocity', 's', 'motor {PORT} set velocity to {V} {U}', [P(), N('V', 50), D('U', VEL)], '{dev}.set_velocity({V}, {U})', '{dev}.setVelocity({V}, {U});', M);
  add('Motors', 'm_set_stopping', 's', 'motor {PORT} set stopping to {M}', [P(), D('M', STOP)], '{dev}.set_stopping({M})', '{dev}.setStopping({M});', M);
  add('Motors', 'm_set_timeout', 's', 'motor {PORT} set timeout to {V} seconds', [P(), N('V', 1)], '{dev}.set_timeout({V}, SECONDS)', '{dev}.setTimeout({V}, seconds);', M);
  add('Motors', 'm_set_torque', 's', 'motor {PORT} set max torque to {V} %', [P(), N('V', 50)], '{dev}.set_max_torque({V}, PERCENT)', '{dev}.setMaxTorque({V}, percent);', M);
  add('Motors', 'm_set_position', 's', 'motor {PORT} set position to {V} {U}', [P(), N('V', 0), D('U', ROT)], '{dev}.set_position({V}, {U})', '{dev}.setPosition({V}, {U});', M);
  add('Motors', 'm_spin_for_units', 's', 'motor {PORT} spin {D} for {V} {U} {W}', [P(), D('D', DIR), N('V', 90), D('U', ROT), D('W', WAIT)], '{dev}.spin_for({D}, {V}, {U}, wait={W})', '{dev}.spinFor({D}, {V}, {U}, {W});', M);
  add('Motors', 'm_spin_to_position', 's', 'motor {PORT} spin to position {V} {U} {W}', [P(), N('V', 90), D('U', ROT), D('W', WAIT)], '{dev}.spin_to_position({V}, {U}, wait={W})', '{dev}.spinToPosition({V}, {U}, {W});', M);
  add('Motors', 'm_position', 'n', 'motor {PORT} position in {U}', [P(), D('U', ROT)], '{dev}.position({U})', '{dev}.position({U})', M);
  add('Motors', 'm_velocity', 'n', 'motor {PORT} velocity in {U}', [P(), D('U', VEL)], '{dev}.velocity({U})', '{dev}.velocity({U})', M);
  add('Motors', 'm_current', 'n', 'motor {PORT} current {U}', [P(), D('U', AMP)], '{dev}.current({U})', '{dev}.current({U})', M);
  add('Motors', 'm_is_done', 'b', 'motor {PORT} is done?', [P()], '{dev}.is_done()', '{dev}.isDone()', M);
  add('Motors', 'm_is_spinning', 'b', 'motor {PORT} is spinning?', [P()], '{dev}.is_spinning()', '{dev}.isSpinning()', M);

  // Looks
  const BR = { dev: 'brain' };
  add('Looks', 'l_clear_row', 's', 'brain screen clear row {R}', [N('R', 1)], '{dev}.screen.clear_row({R})', '{dev}.Screen.clearLine({R});', BR);
  add('Looks', 'l_next_row', 's', 'brain screen next row', [], '{dev}.screen.next_row()', '{dev}.Screen.newLine();', BR);
  add('Looks', 'l_pixel', 's', 'draw pixel at x {X} y {Y}', [N('X', 10), N('Y', 10)], '{dev}.screen.draw_pixel({X}, {Y})', '{dev}.Screen.drawPixel({X}, {Y});', BR);
  add('Looks', 'l_line', 's', 'draw line from x {X} y {Y} to x {X2} y {Y2}', [N('X', 10), N('Y', 10), N('X2', 60), N('Y2', 60)], '{dev}.screen.draw_line({X}, {Y}, {X2}, {Y2})', '{dev}.Screen.drawLine({X}, {Y}, {X2}, {Y2});', BR);
  add('Looks', 'l_rect', 's', 'draw rectangle x {X} y {Y} width {W} height {H}', [N('X', 10), N('Y', 10), N('W', 50), N('H', 30)], '{dev}.screen.draw_rectangle({X}, {Y}, {W}, {H})', '{dev}.Screen.drawRectangle({X}, {Y}, {W}, {H});', BR);
  add('Looks', 'l_circle', 's', 'draw circle x {X} y {Y} radius {R}', [N('X', 60), N('Y', 40), N('R', 20)], '{dev}.screen.draw_circle({X}, {Y}, {R})', '{dev}.Screen.drawCircle({X}, {Y}, {R});', BR);
  add('Looks', 'l_fill', 's', 'set fill colour {C}', [D('C', COLORS)], '{dev}.screen.set_fill_color({C})', '{dev}.Screen.setFillColor({C});', BR);
  add('Looks', 'l_pen', 's', 'set pen colour {C}', [D('C', COLORS)], '{dev}.screen.set_pen_color({C})', '{dev}.Screen.setPenColor({C});', BR);
  add('Looks', 'l_pen_width', 's', 'set pen width {W}', [N('W', 2)], '{dev}.screen.set_pen_width({W})', '{dev}.Screen.setPenWidth({W});', BR);
  add('Looks', 'l_font', 's', 'set font {F}', [D('F', FONTS)], '{dev}.screen.set_font({F})', '{dev}.Screen.setFont({F});', BR);
  add('Looks', 'l_console_print', 's', 'console print {T}', [T('T', 'Hello')], 'print({T})', 'printf("%s\\n", {T});', { textArg: 'T', cppNum: 'printf("%g\\n", (double)({T}));' });
  add('Looks', 'l_console_clear', 's', 'console clear', [], 'print("\\033[2J")', 'printf("\\033[2J\\n");');
  add('Looks', 'l_color_light', 's', 'colour sensor {PORT} light {B} %', [P(), N('B', 50)], '{dev}.set_light({B}, PERCENT)', '{dev}.setLight({B}, percent);', { dev: 'color' });
  add('Looks', 'l_led_brightness', 's', 'touch LED {PORT} brightness {B} %', [P(), N('B', 100)], '{dev}.set_brightness({B})', '{dev}.setBrightness({B});', { dev: 'touchled' });
  add('Looks', 'l_led_fade', 's', 'touch LED {PORT} fade {F}', [P(), D('F', FADES)], '{dev}.set_fade({F})', '{dev}.setFade({F});', { dev: 'touchled' });

  // Sound
  add('Sound', 's_note', 's', 'play note octave {O} note {N} for {D} ms', [N('O', 4), N('N', 0), N('D', 500)], '{dev}.play_note({O}, {N}, {D})', '{dev}.playNote({O}, {N}, {D});', BR);
  add('Sound', 's_sound', 's', 'play sound {S}', [D('S', SOUNDS)], '{dev}.play_sound({S})', '{dev}.playSound({S});', BR);

  // Sensing: brain
  add('Sensing', 'b_battery', 'n', 'brain battery capacity %', [], '{dev}.battery.capacity()', '{dev}.Battery.capacity(percent)', BR);
  add('Sensing', 'b_button', 'b', 'brain button pressed?', [], '{dev}.button.pressing()', '{dev}.buttonCheck.pressing()', BR);
  add('Sensing', 'b_column', 'n', 'brain screen cursor column', [], '{dev}.screen.column()', '{dev}.Screen.column()', BR);
  add('Sensing', 'b_row', 'n', 'brain screen cursor row', [], '{dev}.screen.row()', '{dev}.Screen.row()', BR);
  add('Sensing', 'b_timer_clear', 's', 'reset brain timer', [], '{dev}.timer.clear()', '{dev}.Timer.clear();', BR);
  add('Sensing', 'b_timer', 'n', 'brain timer {U}', [D('U', TIME)], '{dev}.timer.time({U})', '{dev}.Timer.time({U})', BR);
  // Sensing: touch LED, colour, distance
  add('Sensing', 'led_pressing', 'b', 'touch LED {PORT} pressed?', [P()], '{dev}.pressing()', '{dev}.pressing()', { dev: 'touchled' });
  const CS = { dev: 'color' };
  add('Sensing', 'cs_brightness', 'n', 'colour sensor {PORT} brightness', [P()], '{dev}.brightness()', '{dev}.brightness()', CS);
  add('Sensing', 'cs_hue', 'n', 'colour sensor {PORT} hue', [P()], '{dev}.hue()', '{dev}.hue()', CS);
  add('Sensing', 'cs_near', 'b', 'colour sensor {PORT} is near object?', [P()], '{dev}.is_near_object()', '{dev}.isNearObject()', CS);
  add('Sensing', 'cs_sees', 'b', 'colour sensor {PORT} sees {C}', [P(), D('C', COLORS.slice(0, 9))], '({dev}.color() == {C})', '{dev}.detects({C})', CS);
  const DS = { dev: 'distance' };
  add('Sensing', 'ds_distance', 'n', 'distance sensor {PORT} distance in {U}', [P(), D('U', DIST)], '{dev}.distance({U})', '{dev}.objectDistance({U})', DS);
  add('Sensing', 'ds_found', 'b', 'distance sensor {PORT} found object?', [P()], '{dev}.found_object()', '{dev}.isObjectDetected()', DS);
  add('Sensing', 'ds_detected', 'b', 'distance sensor {PORT} object detected?', [P()], '{dev}.is_object_detected()', '{dev}.isObjectDetected()', DS);
  add('Sensing', 'ds_object_distance', 'n', 'distance sensor {PORT} object distance in {U}', [P(), D('U', DIST)], '{dev}.object_distance({U})', '{dev}.objectDistance({U})', DS);
  add('Sensing', 'ds_size', 'n', 'distance sensor {PORT} object size', [P()], '{dev}.object_size()', '{dev}.objectRawSize()', DS);
  add('Sensing', 'ds_velocity', 'n', 'distance sensor {PORT} object velocity', [P()], '{dev}.object_velocity()', '{dev}.objectVelocity()', DS);
  // Sensing: gyro and inertial
  const GY = { dev: 'gyro' };
  add('Sensing', 'gy_calibrate', 's', 'gyro {PORT} calibrate {C}', [P(), D('C', GYROCAL)], '{dev}.calibrate({C})', '{dev}.calibrate({C});', GY);
  add('Sensing', 'gy_heading', 'n', 'gyro {PORT} heading', [P()], '{dev}.heading(DEGREES)', '{dev}.heading()', GY);
  add('Sensing', 'gy_rate', 'n', 'gyro {PORT} rate', [P()], '{dev}.rate()', '{dev}.rate()', GY);
  add('Sensing', 'gy_rotation', 'n', 'gyro {PORT} rotation', [P()], '{dev}.rotation(DEGREES)', '{dev}.rotation()', GY);
  add('Sensing', 'gy_set_heading', 's', 'gyro {PORT} set heading to {V}', [P(), N('V', 0)], '{dev}.set_heading({V}, DEGREES)', '{dev}.setHeading({V}, degrees);', GY);
  add('Sensing', 'gy_set_rotation', 's', 'gyro {PORT} set rotation to {V}', [P(), N('V', 0)], '{dev}.set_rotation({V}, DEGREES)', '{dev}.setRotation({V}, degrees);', GY);
  const IN = { dev: 'inertial' };
  add('Sensing', 'in_accel', 'n', 'inertial acceleration {A}', [D('A', AXES)], '{dev}.acceleration({A})', '{dev}.acceleration({A})', IN);
  add('Sensing', 'in_calibrate', 's', 'inertial calibrate', [], '{dev}.calibrate()', '{dev}.calibrate();', IN);
  add('Sensing', 'in_gyro_rate', 'n', 'inertial gyro rate {A}', [D('A', AXES)], '{dev}.gyro_rate({A}, VelocityUnits.DPS)', '{dev}.gyroRate({A}, dps)', IN);
  add('Sensing', 'in_heading', 'n', 'inertial heading', [], '{dev}.heading(DEGREES)', '{dev}.heading(degrees)', IN);
  add('Sensing', 'in_orientation', 'n', 'inertial orientation {O}', [D('O', ORIENT)], '{dev}.orientation({O}, DEGREES)', '{dev}.orientation({O}, degrees)', IN);
  add('Sensing', 'in_rotation', 'n', 'inertial rotation', [], '{dev}.rotation(DEGREES)', '{dev}.rotation(degrees)', IN);
  add('Sensing', 'in_set_heading', 's', 'inertial set heading to {V}', [N('V', 0)], '{dev}.set_heading({V}, DEGREES)', '{dev}.setHeading({V}, degrees);', IN);
  add('Sensing', 'in_set_rotation', 's', 'inertial set rotation to {V}', [N('V', 0)], '{dev}.set_rotation({V}, DEGREES)', '{dev}.setRotation({V}, degrees);', IN);
  // Sensing: optical
  const OP = { dev: 'optical' };
  add('Sensing', 'op_brightness', 'n', 'optical {PORT} brightness', [P()], '{dev}.brightness()', '{dev}.brightness()', OP);
  add('Sensing', 'op_hue', 'n', 'optical {PORT} hue', [P()], '{dev}.hue()', '{dev}.hue()', OP);
  add('Sensing', 'op_near', 'b', 'optical {PORT} is near object?', [P()], '{dev}.is_near_object()', '{dev}.isNearObject()', OP);
  add('Sensing', 'op_sees', 'b', 'optical {PORT} sees {C}', [P(), D('C', COLORS.slice(0, 9))], '({dev}.color() == {C})', '({dev}.color() == {C})', OP);
  add('Sensing', 'op_set_light', 's', 'optical {PORT} light {S}', [P(), D('S', LED)], '{dev}.set_light({S})', '{dev}.setLight({S});', OP);
  add('Sensing', 'op_light_power', 's', 'optical {PORT} light power {V} %', [P(), N('V', 100)], '{dev}.set_light_power({V}, PERCENT)', '{dev}.setLightPower({V}, percent);', OP);
  add('Sensing', 'op_gesture_on', 's', 'optical {PORT} gestures on', [P()], '{dev}.gesture_enable()', '{dev}.gestureEnable();', OP);
  add('Sensing', 'op_gesture_off', 's', 'optical {PORT} gestures off', [P()], '{dev}.gesture_disable()', '{dev}.gestureDisable();', OP);

  // Events: each runs its stack when the thing happens
  const EV = (id, msg, args, devKind, pyReg, cppReg, extra = {}) => add('Events', id, 'h', msg, [...args, DO], pyReg, cppReg, { dev: devKind, ...extra });
  EV('ev_brain_pressed', 'when brain button pressed {DO}', [], 'brain', '{dev}.button.pressed({fn})', '{dev}.buttonCheck.pressed({fn});');
  EV('ev_brain_released', 'when brain button released {DO}', [], 'brain', '{dev}.button.released({fn})', '{dev}.buttonCheck.released({fn});');
  EV('ev_brain_timer', 'when brain timer reaches {N} ms {DO}', [F('N', 1000)], 'brain', '{dev}.timer.event({fn}, {N})', '{dev}.Timer.event({fn}, {N});');
  EV('ev_bumper_pressed', 'when bumper {PORT} pressed {DO}', [P()], 'bumper', '{dev}.pressed({fn})', '{dev}.pressed({fn});');
  EV('ev_bumper_released', 'when bumper {PORT} released {DO}', [P()], 'bumper', '{dev}.released({fn})', '{dev}.released({fn});');
  EV('ev_led_pressed', 'when touch LED {PORT} pressed {DO}', [P()], 'touchled', '{dev}.pressed({fn})', '{dev}.pressed({fn});');
  EV('ev_led_released', 'when touch LED {PORT} released {DO}', [P()], 'touchled', '{dev}.released({fn})', '{dev}.released({fn});');
  EV('ev_axis_changed', 'when controller axis {A} changed {DO}', [DR('A', CAXIS)], 'controller', '{dev}.axis{A}.changed({fn})', '{dev}.Axis{A}.changed({fn});');
  EV('ev_button_pressed', 'when controller button {B} pressed {DO}', [DR('B', CBTN)], 'controller', '{dev}.button{B}.pressed({fn})', '{dev}.Button{B}.pressed({fn});');
  EV('ev_button_released', 'when controller button {B} released {DO}', [DR('B', CBTN)], 'controller', '{dev}.button{B}.released({fn})', '{dev}.Button{B}.released({fn});');
  EV('ev_gesture_up', 'when optical {PORT} gesture up {DO}', [P()], 'optical', '{dev}.gesture_up({fn})', '{dev}.gestureUp({fn});');
  EV('ev_gesture_down', 'when optical {PORT} gesture down {DO}', [P()], 'optical', '{dev}.gesture_down({fn})', '{dev}.gestureDown({fn});');
  EV('ev_gesture_left', 'when optical {PORT} gesture left {DO}', [P()], 'optical', '{dev}.gesture_left({fn})', '{dev}.gestureLeft({fn});');
  EV('ev_gesture_right', 'when optical {PORT} gesture right {DO}', [P()], 'optical', '{dev}.gesture_right({fn})', '{dev}.gestureRight({fn});');
  EV('ev_object_detected', 'when optical {PORT} object detected {DO}', [P()], 'optical', '{dev}.object_detected({fn})', '{dev}.objectDetected({fn});');
  EV('ev_object_lost', 'when optical {PORT} object lost {DO}', [P()], 'optical', '{dev}.object_lost({fn})', '{dev}.objectLost({fn});');
  // your own events: broadcast by name
  EV('ev_received', 'when I receive {E} {DO}', [{ name: 'E', t: 'txt', def: 'my_event' }], 'event', '{dev}({fn})', '{dev}({fn});');
  add('Events', 'ev_broadcast', 's', 'broadcast {E}', [{ name: 'E', t: 'txt', def: 'my_event' }], '{dev}.broadcast()', '{dev}.broadcast();', { dev: 'event' });
  add('Events', 'ev_broadcast_wait', 's', 'broadcast {E} and wait', [{ name: 'E', t: 'txt', def: 'my_event' }], '{dev}.broadcast_and_wait()', '{dev}.broadcastAndWait();', { dev: 'event' });

  // ---- building the blocks ----
  const argJson = (a) => {
    switch (a.t) {
      case 'num': return { type: 'input_value', name: a.name, check: 'Number' };
      case 'str': return { type: 'input_value', name: a.name };
      case 'bool': return { type: 'input_value', name: a.name, check: 'Boolean' };
      case 'f': return { type: 'field_number', name: a.name, value: a.def };
      case 'txt': return { type: 'field_input', name: a.name, text: a.def };
      case 'port': return { type: 'field_dropdown', name: a.name, options: PORTS };
      case 'stmt': return { type: 'input_statement', name: a.name };
      case 'dd': return { type: 'field_dropdown', name: a.name, options: a.opts.map((o) => (Array.isArray(o) ? o : [labelOf(o), o])) };
      default: throw new Error('bad arg ' + a.t);
    }
  };
  const HUES = { Control: 120, Drivetrain: 170, Motors: 20, Looks: 270, Sound: 310, Sensing: 190, Events: 45 };
  const blockJson = (s) => {
    const order = [];
    const message0 = s.msg.replace(/\{(\w+)\}/g, (m, n) => { order.push(s.args.find((a) => a.name === n)); return '%' + order.length; });
    const j = { type: s.id, message0, args0: order.map(argJson), colour: HUES[s.cat], inputsInline: !s.args.some((a) => a.t === 'stmt') };
    const inlineOnly = s.args.filter((a) => a.t !== 'stmt');
    if (!j.inputsInline) j.inputsInline = inlineOnly.length <= 3;
    if (s.kind === 's') { j.previousStatement = null; j.nextStatement = null; }
    else if (s.kind === 'n') j.output = 'Number';
    else if (s.kind === 'b') j.output = 'Boolean';
    else if (s.kind === 'x') j.output = null;
    else if (s.kind === 'h') j.extensions = ['iq_start_hat'];
    return j;
  };
  Blockly.defineBlocksWithJsonArray(SPECS.map(blockJson).concat([
    { type: 'iq_dt_setup', message0: 'drivetrain left motor port %1 reversed %2 right motor port %3 reversed %4 wheel travel %5 track width %6 wheelbase %7 %8 use brain gyro %9', args0: [
      { type: 'field_dropdown', name: 'LP', options: PORTS }, { type: 'field_checkbox', name: 'LREV', checked: false },
      { type: 'field_dropdown', name: 'RP', options: PORTS }, { type: 'field_checkbox', name: 'RREV', checked: true },
      { type: 'field_number', name: 'TRAVEL', value: 200 }, { type: 'field_number', name: 'TRACK', value: 173 }, { type: 'field_number', name: 'BASE', value: 76 },
      { type: 'field_dropdown', name: 'UNITS', options: [['mm', 'MM'], ['inches', 'INCHES']] }, { type: 'field_checkbox', name: 'GYRO', checked: true },
    ], previousStatement: null, nextStatement: null, colour: HUES.Drivetrain, tooltip: 'Tells the drivetrain blocks which motors to use. Without it they use port 1 and port 6 (reversed). The brain gyro is needed for the heading and rotation blocks.' },
    { type: 'iq_thread', message0: 'start thread %1', args0: [{ type: 'field_input', name: 'NAME', text: 'do something' }], previousStatement: null, nextStatement: null, colour: HUES.Control, tooltip: 'Runs the function with this name at the same time as the rest of the program.' },
  ]));
  Blockly.Python.addReservedWords('drivetrain,brain,controller,brain_inertial');

  // ---- devices ----
  const CLS = { bumper: ['Bumper', 'bumper'], touchled: ['Touchled', 'touchled'], distance: ['Distance', 'distance'], optical: ['Optical', 'optical'], color: ['ColorSensor', 'colorsensor'], gyro: ['Gyro', 'gyro'] };
  const pyBase = (g) => { g.definitions_.import_vex = 'from vex import *'; g.definitions_.brain = 'brain = Brain()'; };
  const ident = (s) => String(s).replace(/[^A-Za-z0-9_]/g, '_').replace(/^(\d)/, '_$1') || 'my_event';

  function ensureDrive(lang, g) {
    if (lang === 'py') {
      pyBase(g);
      g.definitions_.drivetrain_left ||= 'drivetrain_left = Motor(Ports.PORT1, False)';
      g.definitions_.drivetrain_right ||= 'drivetrain_right = Motor(Ports.PORT6, True)';
      g.definitions_.brain_inertial ||= 'brain_inertial = Inertial()';
      g.definitions_.drivetrain ||= 'drivetrain = SmartDrive(drivetrain_left, drivetrain_right, brain_inertial, 200)';
    } else {
      g.definitions_.drivetrain_left ||= 'vex::motor drivetrain_left(PORT1, false);';
      g.definitions_.drivetrain_right ||= 'vex::motor drivetrain_right(PORT6, true);';
      g.definitions_.brain_inertial ||= 'vex::inertial brain_inertial;';
      g.definitions_.drivetrain ||= 'vex::smartdrive Drivetrain(drivetrain_left, drivetrain_right, brain_inertial, 200);';
    }
  }

  function resolve(lang, g, s, b) {
    const isPy = lang === 'py';
    switch (s.dev) {
      case 'brain': if (isPy) pyBase(g); return isPy ? 'brain' : 'Brain';
      case 'controller':
        if (isPy) { pyBase(g); g.definitions_.controller = 'controller = Controller()'; } else g.definitions_.controller = 'vex::controller Controller;';
        return isPy ? 'controller' : 'Controller';
      case 'inertial':
        if (isPy) { pyBase(g); g.definitions_.brain_inertial ||= 'brain_inertial = Inertial()'; } else g.definitions_.brain_inertial ||= 'vex::inertial brain_inertial;';
        return 'brain_inertial';
      case 'drivetrain': ensureDrive(lang, g); return isPy ? 'drivetrain' : 'Drivetrain';
      case 'motor': {
        const port = b.getFieldValue('PORT');
        if (isPy) { pyBase(g); g.definitions_['motor_' + port] ||= `motor_${port} = Motor(Ports.PORT${port}, False)`; } else g.definitions_['motor_' + port] ||= `vex::motor motor_${port}(PORT${port}, false);`;
        return 'motor_' + port;
      }
      case 'event': {
        const name = ident(b.getFieldValue('E'));
        if (isPy) { pyBase(g); g.definitions_['event_' + name] ||= `${name} = Event()`; } else g.definitions_['event_' + name] ||= `vex::event ${name};`;
        return name;
      }
      default: {
        const [pyCls, cppCls] = CLS[s.dev];
        const port = b.getFieldValue('PORT');
        const name = `${pyCls.toLowerCase()}_${port}`;
        if (isPy) { pyBase(g); g.definitions_[name] ||= `${name} = ${pyCls}(Ports.PORT${port})`; } else g.definitions_[name] ||= `vex::${cppCls} ${name}(PORT${port});`;
        return name;
      }
    }
  }

  const isText = (b, name) => { const t = b.getInputTargetBlock(name); return !!t && (t.type === 'text' || t.type === 'text_join' || t.outputConnection?.getCheck()?.includes('String')); };

  function fill(lang, g, s, b, tpl, extra = {}) {
    return tpl.replace(/\{(\w+)\}/g, (m, n) => {
      if (n in extra) return extra[n];
      const a = s.args.find((x) => x.name === n);
      if (!a) return m;
      switch (a.t) {
        case 'num': case 'str': case 'bool': return g.valueToCode(b, n, g.ORDER_NONE) || (a.t === 'str' ? '""' : a.t === 'bool' ? (lang === 'py' ? 'False' : 'false') : String(a.def));
        case 'dd': return lang === 'py' || a.raw ? b.getFieldValue(n) : cppToken(b.getFieldValue(n));
        case 'f': return String(Number(b.getFieldValue(n)));
        default: return b.getFieldValue(n);
      }
    });
  }

  function emit(lang, b, g, s) {
    const isPy = lang === 'py';
    let tpl = isPy ? s.py : s.cpp;
    if (tpl === undefined) return s.kind === 's' || s.kind === 'h' ? '' : ['0', g.ORDER_ATOMIC];
    if (s.textArg && !isPy) { const t = b.getInputTargetBlock(s.textArg); if (t && !isText(b, s.textArg)) tpl = s.cppNum; }
    if (isPy) pyBase(g);
    const dev = s.dev ? resolve(lang, g, s, b) : '';
    if(s.id==='iq_s_sound'&&originalSounds.get(b.getFieldValue('S')))return originalSounds.generate(lang,b.getFieldValue('S'),dev,g);
    if (s.kind === 'h') {
      const idx = b.workspace.getBlocksByType(s.id, true).indexOf(b) + 1;
      const fn = `${s.id.replace(/^iq_/, '')}_${idx}`;
      const inner = g.statementToCode(b, 'DO');
      if (isPy) {
        g.definitions_['cb_' + fn] = `def ${fn}():\n${inner || g.INDENT + 'pass\n'}${fill(lang, g, s, b, tpl, { dev, fn })}`;
        if (s.dev === 'optical' && /gesture/.test(s.id)) g.definitions_['cb_' + fn] += `\n${dev}.gesture_enable()`;
      } else {
        g.definitions_['cb_' + fn] = `void ${fn}() {\n${inner}}`;
        g.protos_.push(`void ${fn}();`);
        if (s.dev === 'optical' && /gesture/.test(s.id)) g.setup_.push(`${dev}.gestureEnable();`);
        g.setup_.push(fill(lang, g, s, b, tpl, { dev, fn }));
      }
      return '';
    }
    const code = fill(lang, g, s, b, tpl, { dev });
    if (s.kind === 's') return code + '\n';
    return [code, isPy ? g.ORDER_FUNCTION_CALL : g.ORDER_ATOMIC];
  }

  for (const s of SPECS) {
    py.forBlock[s.id] = (b, g) => emit('py', b, g, s);
    cp.forBlock[s.id] = (b, g) => emit('cpp', b, g, s);
  }

  // ---- hand-written ones: drivetrain setup and threads ----
  py.forBlock.iq_dt_setup = (b, g) => {
    pyBase(g);
    const rev = (f) => (b.getFieldValue(f) === 'TRUE' ? 'True' : 'False');
    const nums = `${Number(b.getFieldValue('TRAVEL'))}, ${Number(b.getFieldValue('TRACK'))}, ${Number(b.getFieldValue('BASE'))}, ${b.getFieldValue('UNITS')}, 1`;
    g.definitions_.drivetrain_left = `drivetrain_left = Motor(Ports.PORT${b.getFieldValue('LP')}, ${rev('LREV')})`;
    g.definitions_.drivetrain_right = `drivetrain_right = Motor(Ports.PORT${b.getFieldValue('RP')}, ${rev('RREV')})`;
    if (b.getFieldValue('GYRO') === 'TRUE') {
      g.definitions_.brain_inertial ||= 'brain_inertial = Inertial()';
      g.definitions_.drivetrain = `drivetrain = SmartDrive(drivetrain_left, drivetrain_right, brain_inertial, ${nums})`;
    } else g.definitions_.drivetrain = `drivetrain = DriveTrain(drivetrain_left, drivetrain_right, ${nums})`;
    return '';
  };
  cp.forBlock.iq_dt_setup = (b, g) => {
    const rev = (f) => (b.getFieldValue(f) === 'TRUE' ? 'true' : 'false');
    const nums = `${Number(b.getFieldValue('TRAVEL'))}, ${Number(b.getFieldValue('TRACK'))}, ${Number(b.getFieldValue('BASE'))}, ${b.getFieldValue('UNITS').toLowerCase()}`;
    g.definitions_.drivetrain_left = `vex::motor drivetrain_left(PORT${b.getFieldValue('LP')}, ${rev('LREV')});`;
    g.definitions_.drivetrain_right = `vex::motor drivetrain_right(PORT${b.getFieldValue('RP')}, ${rev('RREV')});`;
    if (b.getFieldValue('GYRO') === 'TRUE') {
      g.definitions_.brain_inertial ||= 'vex::inertial brain_inertial;';
      g.definitions_.drivetrain = `vex::smartdrive Drivetrain(drivetrain_left, drivetrain_right, brain_inertial, ${nums});`;
    } else g.definitions_.drivetrain = `vex::drivetrain Drivetrain(drivetrain_left, drivetrain_right, ${nums});`;
    return '';
  };
  py.forBlock.iq_thread = (b, g) => {
    pyBase(g);
    return `Thread(${g.nameDB_.getName(b.getFieldValue('NAME'), Blockly.Names.NameType.PROCEDURE)})\n`;
  };
  cp.forBlock.iq_thread = (b, g) => {
    const name = 'f_' + String(b.getFieldValue('NAME')).replace(/[^A-Za-z0-9_]/g, '_');
    return `thread(${name});\n`;
  };

  // ---- toolbox ----
  const shadow = (a) => (a.t === 'num' ? { shadow: { type: 'math_number', fields: { NUM: a.def } } } : a.t === 'str' ? { shadow: { type: 'text', fields: { TEXT: a.def || 'Hello' } } } : null);
  const toolBlock = (s) => {
    const inputs = {};
    for (const a of s.args) { const sh = shadow(a); if (sh) inputs[a.name] = sh; }
    return Object.keys(inputs).length ? { kind: 'block', type: s.id, inputs } : { kind: 'block', type: s.id };
  };
  const SENSE_GROUPS = [['Brain', /^iq_b_/], ['Touch LED and colour', /^iq_(led_|cs_)/], ['Distance', /^iq_ds_/], ['Gyro', /^iq_gy_/], ['Inertial', /^iq_in_/], ['Optical', /^iq_op_/]];
  const byCat = (cat) => SPECS.filter((s) => s.cat === cat);
  const T0 = Blockly.IQ_TOOLBOX.contents;
  const find = (name) => T0.find((c) => c.name === name);
  const section = (name, hue, contents) => ({ kind: 'category', name, colour: String(hue), contents });

  const events = find('Events');
  events.contents.push(...byCat('Events').map(toolBlock));
  const motors = find('Motors');
  motors.contents.push(...byCat('Motors').map(toolBlock));
  const loops = find('Loops');
  loops.contents.push({ kind: 'block', type: 'controls_for', inputs: { FROM: { shadow: { type: 'math_number', fields: { NUM: 1 } } }, TO: { shadow: { type: 'math_number', fields: { NUM: 10 } } }, BY: { shadow: { type: 'math_number', fields: { NUM: 1 } } } } });
  loops.contents.push(...byCat('Control').map(toolBlock), { kind: 'block', type: 'iq_thread' });

  const extra = [
    section('Drivetrain', HUES.Drivetrain, [{ kind: 'block', type: 'iq_dt_setup', fields: { RP: '6' } }, ...byCat('Drivetrain').map(toolBlock)]),
    section('Looks', HUES.Looks, byCat('Looks').map(toolBlock)),
    section('Sound', HUES.Sound, byCat('Sound').map(toolBlock)),
    section('Sensing', HUES.Sensing, SENSE_GROUPS.map(([name, re]) => section(name, HUES.Sensing, byCat('Sensing').filter((s) => re.test(s.id)).map(toolBlock)))),
    { kind: 'category', name: 'Functions', colour: '290', custom: 'PROCEDURE' },
    { kind: 'category', name: 'Lists (Python)', colour: '260', contents: ['lists_create_with', 'lists_getIndex', 'lists_setIndex', 'lists_length', 'lists_repeat', 'lists_indexOf', 'lists_isEmpty'].map((type) => ({ kind: 'block', type })) },
  ];
  const at = T0.findIndex((c) => c.name === 'Variables');
  T0.splice(at < 0 ? T0.length : at, 0, ...extra);

  Blockly.IQ_SPECS = SPECS;
})();
