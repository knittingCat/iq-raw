# A stand-in for the brain's `vex` module, used by the offline preview. Motors, the drivetrain, sound, the screen and the
# brain buttons are simulated. Sensors are not: they read as 0 / False. Everything talks to the page through `_sim`.
import asyncio as _asyncio
import json as _json
import traceback as _traceback
import js as _js

try:
    from pyodide.ffi import can_run_sync as _can_run_sync, create_proxy as _create_proxy, run_sync as _run_sync
except ImportError:  # pragma: no cover
    _can_run_sync = lambda: False

_sim = _js.simBridge


def _describe(error):
    line = getattr(error, "lineno", None) if isinstance(error, SyntaxError) else None
    for frame in _traceback.extract_tb(error.__traceback__):
        if frame.filename == "<program>":
            line = frame.lineno
    return ("Line %d: " % line if line else "") + type(error).__name__ + ": " + str(error)


def _send(**message):
    _sim.send(_json.dumps(message))


def _warn_once(key, text):
    if key not in _warned:
        _warned.add(key)
        _send(type="console", text=text + "\n")


_warned = set()

# ---- constants ----
FORWARD = 1
REVERSE = -1
RIGHT = 1
LEFT = -1
PERCENT = "PERCENT"
RPM = "RPM"
DPS = "DPS"
VOLT = "VOLT"
DEGREES = "DEGREES"
TURNS = "TURNS"
SECONDS = "SECONDS"
MSEC = "MSEC"
MM = "MM"
INCHES = "INCHES"
BRAKE = "BRAKE"
COAST = "COAST"
HOLD = "HOLD"


class DirectionType:
    FORWARD = 1
    REVERSE = -1


class TurnType:
    RIGHT = 1
    LEFT = -1


class VelocityUnits:
    PERCENT = "PERCENT"
    RPM = "RPM"
    DPS = "DPS"
    VOLT = "VOLT"


class RotationUnits:
    DEG = "DEGREES"
    DEGREES = "DEGREES"
    REV = "TURNS"
    TURNS = "TURNS"


class TimeUnits:
    SECONDS = "SECONDS"
    SEC = "SECONDS"
    MSEC = "MSEC"


class DistanceUnits:
    MM = "MM"
    IN = "INCHES"
    INCHES = "INCHES"


class BrakeType:
    BRAKE = "BRAKE"
    COAST = "COAST"
    HOLD = "HOLD"


class CurrentUnits:
    AMP = "AMP"


class Ports:
    pass


for _i in range(1, 13):
    setattr(Ports, "PORT%d" % _i, _i)


class _Named:
    pass


def _names(prefix, names):
    holder = type(prefix, (), {})
    for n in names:
        setattr(holder, n, prefix + "." + n)
    return holder


FontType = _names("FontType", ["MONO12", "MONO15", "MONO20", "MONO30", "MONO40", "MONO60", "PROP20", "PROP30", "PROP40"])
SoundType = _names("SoundType", ["SIREN", "WRONG_WAY", "WRONG_WAY_SLOW", "FILLUP", "HEADLIGHTS_ON", "HEADLIGHTS_OFF", "TOLLBOOTH", "ALARM", "TADA", "DOOR_CLOSE", "RATCHET", "WRENCH", "SIREN2", "RATCHET2", "ALARM2", "POWER_DOWN"])
AxisType = _names("AxisType", ["XAXIS", "YAXIS", "ZAXIS"])
OrientationType = _names("OrientationType", ["PITCH", "ROLL", "YAW"])
GyroCalibrationType = _names("GyroCalibrationType", ["NORMAL", "SLOW", "EXTENDED"])
FadeType = _names("FadeType", ["SLOW", "FAST", "OFF"])
LedStateType = _names("LedStateType", ["ON", "OFF"])


class Color:
    RED = "Color.RED"
    GREEN = "Color.GREEN"
    BLUE = "Color.BLUE"
    YELLOW = "Color.YELLOW"
    ORANGE = "Color.ORANGE"
    PURPLE = "Color.PURPLE"
    CYAN = "Color.CYAN"
    WHITE = "Color.WHITE"
    BLACK = "Color.BLACK"
    TRANSPARENT = "Color.TRANSPARENT"
    RED_VIOLET = "Color.RED_VIOLET"
    VIOLET = "Color.VIOLET"
    BLUE_VIOLET = "Color.BLUE_VIOLET"
    BLUE_GREEN = "Color.BLUE_GREEN"
    YELLOW_GREEN = "Color.YELLOW_GREEN"
    YELLOW_ORANGE = "Color.YELLOW_ORANGE"
    RED_ORANGE = "Color.RED_ORANGE"

    def __init__(self, *rgb):
        if len(rgb) == 1:
            n = int(rgb[0])
            rgb = ((n >> 16) & 255, (n >> 8) & 255, n & 255)
        self.rgb = "rgb(%d,%d,%d)" % tuple(max(0, min(255, int(c))) for c in rgb[:3])


def _colour(c):
    return c.rgb if isinstance(c, Color) else str(c)


# ---- time ----
def _sleep_ms(ms):
    # When the browser supports stack switching, other Threads and events run while this one waits.
    # Otherwise the wait blocks the whole preview (it still polls the brain buttons).
    ms = max(0.0, float(ms))
    _send(type="flush")
    end = _sim.now() + ms
    switching = _can_run_sync()
    while True:
        left = end - _sim.now()
        if left <= 0 and not (switching and ms == 0):
            break
        chunk = min(max(left, 0), 10)
        if switching:
            _run_sync(_asyncio.sleep(chunk / 1000))
        else:
            _sim.nap(chunk)
        _poll()
        if ms == 0:
            break


def wait(time, units=MSEC):
    _sleep_ms(time * 1000 if str(units).upper().endswith("SECONDS") else time)


# ---- events: brain buttons and timers are polled while the program waits ----
_press_handlers = []
_release_handlers = []
_timer_handlers = []
_last_check = [False]
_live = set()


def _poll():
    down = bool(_sim.button("check"))
    if down != _last_check[0]:
        _last_check[0] = down
        for fn in list(_press_handlers if down else _release_handlers):
            _spawn(fn)
    now = _sim.now() - _brain_timer_zero[0]
    for h in _timer_handlers:
        if not h[2] and now >= h[1]:
            h[2] = True
            _spawn(h[0])


def _has_handlers():
    return bool(_press_handlers or _release_handlers or _timer_handlers or _live)


# ---- threads and events: they run side by side when the browser supports stack switching, one after another otherwise ----
class _Task:
    def __init__(self):
        self.done = False


def _spawn(fn, args=()):
    task = _Task()

    def body():
        try:
            fn(*args)
        except BaseException as error:
            _send(type="error", message=_describe(error))
        finally:
            task.done = True
            _live.discard(task)

    if _can_run_sync():
        _live.add(task)
        _sim.startThread(_create_proxy(body))
    else:
        _warn_once("thread", "Note: this browser can't run Threads and events at the same time, so each runs to completion first.")
        body()
    return task


class Event:
    def __init__(self, callback=None):
        self._callbacks = []
        if callback:
            self._callbacks.append(callback)

    def __call__(self, callback, *args):
        self._callbacks.append(callback)

    def broadcast(self):
        for fn in list(self._callbacks):
            _spawn(fn)

    def broadcast_and_wait(self):
        tasks = [_spawn(fn) for fn in list(self._callbacks)]
        while not all(t.done for t in tasks):
            _sleep_ms(5)


class Thread:
    def __init__(self, fn, args=()):
        self._task = _spawn(fn, args)

    def stop(self):
        pass

    def is_alive(self):
        return not self._task.done


class Timer:
    def __init__(self):
        self._zero = _sim.now()

    def time(self, units=MSEC):
        ms = _sim.now() - self._zero
        return ms / 1000 if str(units).upper().endswith("SECONDS") else ms

    def clear(self):
        self._zero = _sim.now()

    reset = clear

    def event(self, callback, ms=1000):
        _timer_handlers.append([callback, ms, False])


# ---- devices that are not simulated ----
class _Stub:
    def __init__(self, label="device"):
        object.__setattr__(self, "_label", label)

    def __getattr__(self, name):
        if name.startswith("__"):
            raise AttributeError(name)
        return _Stub(self._label + "." + name)

    def __call__(self, *args, **kwargs):
        _warn_once(self._label, "Note: %s is not simulated; it reads as 0 or False." % self._label)
        last = self._label.split(".")[-1]
        return False if last in ("pressing", "found_object") or last.startswith("is_") else 0

    def __bool__(self):
        return False

    def __int__(self):
        return 0

    def __float__(self):
        return 0.0

    def __lt__(self, other):
        return 0 < other

    def __gt__(self, other):
        return 0 > other

    def __le__(self, other):
        return 0 <= other

    def __ge__(self, other):
        return 0 >= other

    def __eq__(self, other):
        return other == 0

    def __hash__(self):
        return 0


def _sensor(name):
    class Sensor(_Stub):
        def __init__(self, *args, **kwargs):
            _Stub.__init__(self, name)
            if args and isinstance(args[0], int):
                _send(type="device", kind=name.lower(), port=args[0])

    Sensor.__name__ = name
    return Sensor


Bumper = _sensor("Bumper")
Touchled = _sensor("Touchled")
Distance = _sensor("Distance")
Optical = _sensor("Optical")
ColorSensor = _sensor("ColorSensor")
Gyro = _sensor("Gyro")
Inertial = _sensor("Inertial")
Controller = _sensor("Controller")
Vision = _sensor("Vision")


# ---- motors ----
def _opt(v):
    return None if v is None else v


class Motor:
    def __init__(self, port, reverse=False, *args):
        self._port = int(port)
        self._reverse = bool(reverse)
        _sim.motorAttach(self._port, self._reverse)

    def spin(self, direction, velocity=None, units=None):
        _sim.motorSpin(self._port, direction, _opt(velocity), units)

    def spin_for(self, direction, value, units=DEGREES, velocity=None, units_v=None, wait=True):
        ms = _sim.motorSpinFor(self._port, direction, value, units, _opt(velocity), units_v)
        if wait:
            _sleep_ms(ms)

    def spin_to_position(self, value, units=DEGREES, velocity=None, units_v=None, wait=True):
        ms = _sim.motorSpinTo(self._port, value, units, _opt(velocity), units_v)
        if wait:
            _sleep_ms(ms)

    def stop(self, mode=None):
        if mode is not None:
            _sim.motorSetStopping(self._port, mode)
        _sim.motorStop(self._port)

    def set_velocity(self, value, units=PERCENT):
        _sim.motorSetVelocity(self._port, value, units)

    def set_stopping(self, mode):
        _sim.motorSetStopping(self._port, mode)

    def set_timeout(self, value, units=SECONDS):
        pass

    def set_max_torque(self, value, units=PERCENT):
        pass

    def set_reversed(self, value):
        self._reverse = bool(value)
        _sim.motorAttach(self._port, self._reverse)

    def set_position(self, value, units=DEGREES):
        _sim.motorSetPosition(self._port, value, units)

    def reset_position(self):
        _sim.motorSetPosition(self._port, 0, DEGREES)

    def position(self, units=DEGREES):
        return float(_sim.motorPosition(self._port, units))

    def velocity(self, units=PERCENT):
        return float(_sim.motorVelocity(self._port, units))

    def current(self, units=None):
        return 0.2 if _sim.motorIsSpinning(self._port) else 0.0

    def is_done(self):
        return bool(_sim.motorIsDone(self._port))

    def is_spinning(self):
        return bool(_sim.motorIsSpinning(self._port))


class DriveTrain:
    def __init__(self, left_motor, right_motor, wheel_travel=200, track_width=173, wheelbase=76, units=MM, external_gear_ratio=1):
        _sim.driveSetup(left_motor._port, left_motor._reverse, right_motor._port, right_motor._reverse, wheel_travel, track_width, units)

    def drive(self, direction, velocity=None, units=None):
        if velocity is not None:
            _sim.driveSetVelocity(velocity, units)
        _sim.driveDrive(direction)

    def drive_for(self, direction, distance, units=MM, velocity=None, units_v=None, wait=True):
        if velocity is not None:
            _sim.driveSetVelocity(velocity, units_v)
        ms = _sim.driveFor(direction, distance, units)
        if wait:
            _sleep_ms(ms)

    def turn(self, direction, velocity=None, units=None):
        if velocity is not None:
            _sim.driveSetTurnVelocity(velocity, units)
        _sim.driveTurn(direction)

    def turn_for(self, direction, angle, units=DEGREES, velocity=None, units_v=None, wait=True):
        if velocity is not None:
            _sim.driveSetTurnVelocity(velocity, units_v)
        ms = _sim.driveTurnFor(direction, angle, units)
        if wait:
            _sleep_ms(ms)

    def turn_to_heading(self, angle, units=DEGREES, velocity=None, units_v=None, wait=True):
        if velocity is not None:
            _sim.driveSetTurnVelocity(velocity, units_v)
        ms = _sim.driveTurnToHeading(angle, units)
        if wait:
            _sleep_ms(ms)

    def turn_to_rotation(self, angle, units=DEGREES, velocity=None, units_v=None, wait=True):
        if velocity is not None:
            _sim.driveSetTurnVelocity(velocity, units_v)
        ms = _sim.driveTurnToRotation(angle, units)
        if wait:
            _sleep_ms(ms)

    def stop(self, mode=None):
        _sim.driveStop()

    def set_drive_velocity(self, value, units=PERCENT):
        _sim.driveSetVelocity(value, units)

    def set_turn_velocity(self, value, units=PERCENT):
        _sim.driveSetTurnVelocity(value, units)

    def set_stopping(self, mode):
        pass

    def set_timeout(self, value, units=SECONDS):
        pass

    def set_heading(self, value, units=DEGREES):
        _sim.driveSetHeading(value, units)

    def set_rotation(self, value, units=DEGREES):
        _sim.driveSetRotation(value, units)

    def heading(self, units=DEGREES):
        return float(_sim.driveHeading(units))

    def rotation(self, units=DEGREES):
        return float(_sim.driveRotation(units))

    def velocity(self, units=PERCENT):
        return float(_sim.driveVelocity(units))

    def current(self, units=None):
        return 0.4 if _sim.driveIsMoving() else 0.0

    def is_done(self):
        return bool(_sim.driveIsDone())

    def is_moving(self):
        return bool(_sim.driveIsMoving())


class SmartDrive(DriveTrain):
    def __init__(self, left_motor, right_motor, gyro, wheel_travel=200, track_width=173, wheelbase=76, units=MM, external_gear_ratio=1):
        DriveTrain.__init__(self, left_motor, right_motor, wheel_travel, track_width, wheelbase, units, external_gear_ratio)


# ---- the brain ----
_FONT_HEIGHT = {"MONO12": 12, "MONO15": 15, "MONO20": 20, "MONO30": 30, "MONO40": 40, "MONO60": 60, "PROP20": 20, "PROP30": 30, "PROP40": 40}
_brain_timer_zero = [0.0]


def _format(value, precision):
    if isinstance(value, bool):
        return "True" if value else "False"
    if isinstance(value, float):
        return "%.*f" % (precision, value)
    return str(value)


class _Screen:
    def __init__(self):
        self._row = 1
        self._col = 1
        self._font = 12

    def _draw(self, op, **values):
        _send(type="draw", op=op, **values)

    def print(self, *args, **kwargs):
        sep = kwargs.get("sep", " ")
        text = sep.join(_format(a, kwargs.get("precision", 2)) for a in args)
        self._draw("text", text=text, x=(self._col - 1) * self._font * 0.6, y=self._row * self._font)
        self._col += len(text)

    def print_at(self, *args, **kwargs):
        sep = kwargs.get("sep", " ")
        text = sep.join(_format(a, kwargs.get("precision", 2)) for a in args)
        self._draw("text", text=text, x=kwargs.get("x", 0), y=kwargs.get("y", 0))

    def set_cursor(self, row, col):
        self._row = max(1, int(row))
        self._col = max(1, int(col))

    def next_row(self):
        self._row += 1
        self._col = 1

    def row(self):
        return self._row

    def column(self):
        return self._col

    def clear_screen(self, color=None):
        self._draw("clear")
        self._row = self._col = 1

    def clear_row(self, row=1, color=None):
        self._draw("clearRow", y=(row - 1) * self._font, h=self._font)

    def set_pen_color(self, color):
        self._draw("pen", colour=_colour(color))

    def set_fill_color(self, color):
        self._draw("fill", colour=_colour(color))

    def set_pen_width(self, width):
        self._draw("width", value=width)

    def set_font(self, font):
        name = str(font).split(".")[-1]
        self._font = _FONT_HEIGHT.get(name, 12)
        self._draw("font", height=self._font, proportional=name.startswith("PROP"))

    def draw_pixel(self, x, y):
        self._draw("pixel", x=int(x), y=int(y))

    def draw_line(self, x1, y1, x2, y2):
        self._draw("line", x=int(x1), y=int(y1), x2=int(x2), y2=int(y2))

    def draw_rectangle(self, x, y, width, height, color=None):
        if color is not None:
            self.set_fill_color(color)
        self._draw("rect", x=int(x), y=int(y), w=int(width), h=int(height))

    def draw_circle(self, x, y, radius, color=None):
        if color is not None:
            self.set_fill_color(color)
        self._draw("circle", x=int(x), y=int(y), r=int(radius))

    def render(self):
        _send(type="render")

    def __getattr__(self, name):
        if name.startswith("__"):
            raise AttributeError(name)
        return _Stub("brain.screen." + name)


class _Button:
    def pressing(self):
        return bool(_sim.button("check"))

    def pressed(self, callback):
        _press_handlers.append(callback)

    def released(self, callback):
        _release_handlers.append(callback)


class _Timer:
    def time(self, units=MSEC):
        ms = _sim.now() - _brain_timer_zero[0]
        return ms / 1000 if str(units).upper().endswith("SECONDS") else ms

    def clear(self):
        _brain_timer_zero[0] = _sim.now()

    def reset(self):
        self.clear()

    def event(self, callback, ms=1000):
        _timer_handlers.append([callback, ms, False])


class _Battery:
    def capacity(self, units=PERCENT):
        return 100

    def voltage(self, units=None):
        return 8.2

    def current(self, units=None):
        return 0.0


class Brain:
    def __init__(self):
        self.screen = _Screen()
        self.button = _Button()
        self.buttonCheck = self.button
        self.timer = _Timer()
        self.battery = _Battery()
        _brain_timer_zero[0] = _sim.now()

    def play_note(self, octave, note, duration=500):
        _sim.playNote(octave, note, duration)
        _sleep_ms(duration)

    def play_sound(self, sound):
        _sim.playSound(sound)

    def __getattr__(self, name):
        if name.startswith("__"):
            raise AttributeError(name)
        return _Stub("brain." + name)


def vexcode_brain_precision(*args):
    pass
