# iq-raw

Drag blocks or write raw code, and send it to a VEX IQ (2nd generation) brain over USB. Unlike VEXcode IQ's block editor, you can write the program yourself in Python or C++, and the C++ route reaches the brain's pin-level calls.

**Status:** built from VEX's own headers, templates and tool help, and checked only by compiling. It has not run on a real brain yet. See [Testing with a real brain](#testing-with-a-real-brain).

## Install

Works on macOS, Windows and Linux. Each block below installs Node, git and VS Code (skipping any you already have), adds VEX's VS Code extension, gets this project, and starts it.

**macOS:** paste this into Terminal. You need [Homebrew](https://brew.sh) for the first line.

```sh
brew install node git && brew install --cask visual-studio-code \
&& code --install-extension vexrobotics.vexcode \
&& git clone https://github.com/knittingCat/iq-raw.git && cd iq-raw \
&& npm install && npm start
```

**Windows 10 or 11:** paste this into PowerShell. It uses `winget`, which Windows already has. Close and reopen PowerShell after the first line so it finds the new programs, then run the rest:

```powershell
winget install -e --id OpenJS.NodeJS.LTS; winget install -e --id Git.Git; winget install -e --id Microsoft.VisualStudioCode
code --install-extension vexrobotics.vexcode
git clone https://github.com/knittingCat/iq-raw.git; cd iq-raw; npm install; npm start
```

**Linux:** install Node 18 or newer, git and VS Code with your package manager, then run the last three lines of the macOS block. To use the brain's USB ports without root, add yourself to the group that owns `/dev/ttyACM*` (usually `dialout`: `sudo usermod -aG dialout $USER`), then log out and back in.

Then open http://localhost:5174 in Chrome, Edge, Safari or Firefox. If you already have Node, git and VS Code, only the last three commands matter.

**One manual step, needed for both languages:** installing the extension is not enough. It downloads its tools (including `vexcom`, which sends programs to the brain) the first time you use it. Open VS Code, press Cmd+Shift+P (Ctrl+Shift+P on Windows and Linux), type "New Project", pick the VEX one (or use the VEX icon in the sidebar), and make an **IQ (2nd gen) C++** project once. Wait for the downloads to finish. For Python mode this makes `vexcom` appear; for C++ mode it also gets VEX's C++ SDK and compiler. If iq-raw says "vexcom was not found", this step is what is missing.

On Apple Silicon Macs, VEX's `vexcom` is an Intel program, so macOS may ask to install Rosetta the first time.

For C++ builds, wait for the toolchain download and extraction to finish. If it was interrupted, run VEX's **Download Toolchain** command in VS Code again. iq-raw looks for the same toolchain folder VEX's extension uses (`toolchain_osxarm64` or `toolchain_osx64` on a Mac, `toolchain_win32` or `toolchain_winarm64` on Windows, `toolchain_linux64` or `toolchain_linuxarm64` on Linux), and also checks `~/.iq-raw/toolchains` for a local installation. A ZIP file alone is not an installed toolchain.

Before downloading to a brain, disconnect it in VEXcode IQ or save and quit VEXcode IQ. Another app holding the brain's USB ports open can interfere with transfers even when **Check brain** succeeds.

To run it again later: `cd iq-raw && npm start`. To stop it: Ctrl+C in that Terminal or PowerShell window. If port 5174 is taken, pick another: `PORT=5175 npm start` (macOS/Linux) or `$env:PORT=5175; npm start` (PowerShell).

**Something not working?** See [TROUBLESHOOTING.md](TROUBLESHOOTING.md). It covers the server, missing VEX tools, a brain that is [not found](TROUBLESHOOTING.md#brain-not-found) or [busy](TROUBLESHOOTING.md#the-brain-is-busy-or-the-port-is-in-use), every `vexcom` exit code, C++ builds, the live console, Bluetooth and the preview. The same guide is built into iq-raw: press **Help**, or the **How to fix** link that appears under an error in the console.

## How to use it

1. **Plug the brain in** with a USB-C cable and turn it on. If macOS shows an **"Allow accessory to connect?"** prompt, click **Allow**. Until you do, the Mac lists the brain but blocks it, and iq-raw (and VS Code's VEX extension) report "Device not specified or not found" or "no device connected". Press **Check brain** (top right). The status next to it turns green and says "connected" when it finds the brain. If it turns red, it says why (no brain, brain busy, or VEX tools missing), with a **How to fix** link.
2. **Pick a language** in the top bar: Python or C++.
3. **Pick a slot** (1 to 8) and a name. This is where the program is stored on the brain and the name it shows.
4. **Make the program**, either way:
   - Drag blocks from the left toolbox. The code they make appears on the right and updates live.
   - Or tick **Edit code by hand** and type your own code in the box. Block syncing then stops. Untick it to go back to blocks, which replaces what you typed.
5. **Send it:**
   - **Download and run** sends the program to the slot and starts it.
   - **Download** sends it without starting.
   - **Run slot** starts whatever is already in the slot. **Stop** stops the running program.
6. Messages from the tools appear in the **Console** at the bottom right. **Run slot** and **Download and run** connect the console before starting the program, so startup prints are captured. You can also press **Connect brain** manually. Use the input field for `ask` blocks. Clear, copy, ANSI text colours, and reconnect are supported. C++ generated programs disable stdout buffering so same-row prints appear promptly; regenerate and download older programs to apply this change.

Downloads show a live 40-character `█`/`░` progress bar **as an updating text line in the console output alongside Done. and program messages**, including in fullscreen; starting a build or transfer opens the console if collapsed. The same indicator covers C++ **1/2 · Building** (animated/indeterminate) and **2/2 · Downloading** (VEXcom's reported percentage). **Build only** also uses this indicator. A failed transfer keeps its last percentage and reports failure; only a successful result displays completion. Progress is streamed while the transfer runs, rather than replayed afterwards in the log.

During a build/download/run, incoming program text and monitor updates are buffered in the initiating editor until the action result is logged. On success, **Done.** appears before buffered startup output is displayed. Failures report the error before releasing buffered text and do not print Done. Program-issued console clear commands clear program text while preserving tool/completion messages; the console's Clear button clears everything.

New or empty workspaces start with **when started** already on the canvas. Toolbox blocks must be dragged onto it; clicking a toolbox block does not insert it. Categories use coloured dots, numeric/text reporters are rounded, and Boolean reporters are hexagonal.

**Shortcuts:** Ctrl+Enter (Cmd+Enter on a Mac) downloads and runs, Ctrl+S saves the code to a file, and Ctrl+B builds in C++ mode.

The header's icon buttons independently collapse program controls, source code, and console. **Fullscreen focus mode** collapses all three and turns the main actions into icon buttons with tooltips. Reopen the panels you need using the header buttons; Escape or the fullscreen button restores the previous layout.

**Brain preview:** use the chip-shaped **Brain preview** button in the header, then **Run blocks**. The offline simulator executes a snapshot of your blocks in a browser worker and draws a 160 × 108 screen over a realistic IQ2 brain illustration with left/right arrows, Check and X. **Enlarge screen** makes graphs easier to inspect; **Save screen** exports a PNG. **Try drawing demo** runs a sample without changing your workspace. Check triggers brain-button events, and X/Stop/closing the preview terminates simulation. No brain, USB connection, Python installation or C++ build is needed.

The preview supports screen text/drawing, graphs, real/complex math and numerical calculus, variables, lists, loops, conditions, procedures, timers and console print. **Run Python code** executes the code editor with Pyodide in a browser worker. **Run C++ code** in the local app compiles to sandboxed WebAssembly; install that preview compiler once with `npm run setup-preview` (macOS, Windows or Linux, x64 or arm64; it downloads the matching [WASI SDK](https://github.com/WebAssembly/wasi-sdk) over several parallel connections and checks its SHA-256). On macOS the compiler runs inside a `sandbox-exec` profile; Windows and Linux have no equivalent, so there it relies on the same source checks (allow-listed headers only; no assembly, embedded files, `%:` digraph directives, `__has_include` or `_Pragma`). These code previews support screen/buttons/console/timing/musical notes, with approximate browser fonts and timing. The concurrent Python preview engine, attached-motor visualization and synthesized sound effects from the newer upstream commits are retained. Robot motion and sounds remain approximate; C++ callbacks and threads are unsupported. Stop/close terminates the worker. The hosted C++ **Build only / Download** compiler below targets the actual brain; C++ code preview still uses the local app. Generated image details are in [asset notes](public/assets/README.md).

**Program tree:** the tree icon opens a fullscreen, pannable and zoomable graph of the actual workspace. Vector icons and colors distinguish providers, operators, controls, events and actions. Arrows connect input dependencies, control branches and following statements. **Run & trace** executes a snapshot of the blocks offline, showing latest values, true/false counts, executed branches, last-assignment links and errors at their originating nodes. Click a node for its inputs, error context and a link back to the workspace. Check activates brain-button event paths. Stop, close or workspace changes terminate the trace; JSON export includes the evidence and graph connections. “Never activates” is reserved for constant conditions, disabled blocks and unconditional termination; unvisited dynamic paths remain uncertain. This traces blocks, not hand-edited Python/C++ or real hardware. Layout uses [Dagre](https://github.com/dagrejs/dagre).

**Bluetooth:** choose **Transfer → Bluetooth**, then **Connect Bluetooth** in Chrome/Edge. Select a powered IQ2 brain and enter the four-digit code shown on its screen; codes are not saved. The browser talks directly to IQ2 GATT services without vexcom. Download, download-and-run, run-slot, Stop and UTF-8 console input/output use this transport. USB remains available in the local app. Pairing and transfer follow the protocol used by [VEXcode IQ](https://codeiq.vex.com/) and the [official connection guide](https://kb.vex.com/hc/en-us/articles/40017043048852-Wirelessly-Connecting-an-IQ-2nd-gen-Brain-to-VEXcode-IQ). All transfer ACKs, CRCs and lengths are checked; failed or disconnected transfers are not marked complete or automatically retried. Progress includes building, file writes and the final acknowledged exit; Done precedes program console output. Python requires the Python VM to have been installed once using USB; Bluetooth checks for it before overwriting a program. Live hardware verification is still needed with a powered IQ2; automated tests cover fragmented responses, pairing, files, run/halt, failure and disconnect behavior.

**C++ on the website:** the hosted editor compiles real ARM Cortex-M4 IQ2 binaries entirely in a dedicated browser worker, then transfers them directly over Bluetooth. No local server or paid compiler service is required. First compilation downloads about 95 MB of compiler assets plus a 5 MB SDK bundle, so allow time on a slow connection. The compiler is the pinned prerelease [microbit-clang-wasm](https://github.com/carlosperate/microbit-clang-wasm), configured with VEX's IQ2 headers, GCC libraries and runtime rather than micro:bit libraries. The SDK linker script's section-relative boot offset is adjusted for LLD, and generated ELF data is converted to the same binary layout as GNU objcopy. Compiler errors appear in the console and prevent transfer. An optional precompiled `.bin` selection explicitly overrides editor C++ until **Use editor code** is selected. Builds target the actual brain; they do not execute the program on the website.

To refresh hosted assets after changes, install the IQ2 SDK using the VEX extension, run `npm run setup-web-compiler`, then `node scripts/export-hosted.mjs /path/to/site/public/iq-raw`. The SDK bundle includes its license and the export retains compiler/library notices. Browser compiler and simulator workers receive restrictive CSP headers; they cannot contact the app's USB API. `node test/browser-compiler.test.mjs` performs a real WebAssembly compiler/linker build and checks generated ARM output and diagnostics. Physical execution and radio reliability require hardware testing.

**Python mode, first time on a brain:** press **Install Python VM** once. It puts VEX's Python interpreter on the brain. Redo it after a VEXos update.

**C++ mode:** press **Build only** to compile and see errors without touching the brain. Download compiles first, then sends.

Other buttons: **Open .py** and **Save .py** load and save the code box as a file (`.cpp` in C++ mode). **Programs on brain** lists what is stored. **Probe brain API** (Python) runs a small program that prints which calls the brain's Python offers.

**Make it yours:** open **Settings → Appearance** for System, Light, Dark, Midnight, High Contrast, or the patterned Aurora, Blueprint, Circuit, and Sunset themes. Settings also includes theme previews, app-wide or canvas-only patterns with Off, Subtle, Bold, and Vivid strength, alignment dots, code text size, and saved language, slot, and name. Preferences save automatically in this browser.

### The blocks

**Advanced math:** open **Math** for arithmetic (√, powers, nth roots, rounding and logarithms), all six trigonometric and inverse trigonometric functions, all six hyperbolic and inverse hyperbolic functions, comparisons and inequalities, and 25 constants including π, τ, e, φ, ∞, Euler–Mascheroni, Catalan, Apéry and Feigenbaum constants. Trigonometric functions use radians; angle-conversion blocks are included. `acot` uses the principal range (0, π). Invalid real domains and finite-input overflow produce NaN; use the finite/NaN test block to handle them.

**Calculus and series:** these are numerical approximations, not symbolic algebra. Plug the **x (bound variable)** block into the function input of an integral, derivative, sum, product, or graph. The default function for calculus is x². Definite integrals use composite Simpson’s rule with 2–1024 steps; derivatives use a central difference with a configurable positive step (first or second derivative). Sums (∑) and products (Π) include both integer endpoints and allow at most 4096 terms. Infinite endpoints are unsupported. An empty sum is 0; an empty product is 1. Very small derivative steps can lose accuracy on the brain’s floating-point hardware.

**Complex numbers:** create a + bi or the imaginary unit i, then add, subtract, multiply, divide, raise to a complex power, conjugate, or apply complex √, exp, ln, sin, cos, tan, sinh and cosh. Use Re(), Im(), magnitude, and argument to get real values, or the dedicated complex print block to show a complex result. Complex values have dedicated set/get variable blocks, separate from ordinary numeric variables. Python uses the brain’s documented `cmath` library; C++ uses `std::complex`.

**Graph on the brain:** clear the screen, choose a pen color, draw graph axes, then use **Math → Graphing → graph y = …**. Its default function is sin(x). Set the x and y ranges to fit your function. The graph samples all 160 screen columns; off-screen or undefined values break the line, and large jumps are not joined. This is a sampled plot, so very narrow features and some discontinuities can still be missed. Graphing resets the origin and clipping to the full 160 × 108 screen.

**Brain drawing:** pixels, lines, rectangles, circles, outline ellipses, arcs and triangles, pen/fill colors (including custom RGB), pen width, fonts, positioned text, drawing origin, clipping, clear and render. Screen coordinates start at the top left: x = 0–159, y = 0–107. Positive arc angles run clockwise from the right. Drawing calls follow VEX’s [IQ2 screen API](https://api.vex.com/iq2/home/python/Screen.html); math libraries follow its [MicroPython library list](https://api.vex.com/iq2/home/python/Micropython_libraries.html). Math is numerically tested and the C++ is compiled against VEX’s SDK; these additions have not been tested on a physical brain.

Attach blocks underneath **when started**. Those blocks run once in order when the program starts. Existing programs are preserved, including legacy programs without a start block; use **Events → when started** to add one to an older program.

| Category | What it does |
|---|---|
| Events | "When started", plus a stack that runs when a brain button, bumper, touch LED, controller axis or button, or optical gesture or object event happens, or when a named event you broadcast arrives. |
| Brain | Print to the brain screen, clear it, move the cursor, wait. |
| Motors | Spin (with or without a speed, for a distance, or to a position), stop, set velocity, stopping mode, timeout, torque and position, and read position, velocity, current, done and spinning. |
| Ports | Raw volts to a motor, Touch LED colour, bumper and distance reads, and "port N device, call anything". |
| Pins (C++) | Write high or low to one of the 12 ports' prongs, plus pin enable, write, read, digital and analog reads. C++ only. |
| Controller | Joystick axes A to D, ten buttons including L3/R3, and tank-drive steps with an enable/disable gate. |
| Loops | While, repeat, forever, repeat until, for, if/else/else-if, break, wait until, wait with units, stop project, comments, and start a thread. |
| Logic, Math, Text, Variables | The usual building blocks. |
| Drivetrain | A setup block (motor ports, wheel size, brain gyro), then drive, drive for a distance, turn, turn for, turn to heading or rotation, velocities, stopping, timeout, and reads for heading, rotation, velocity, current, done and moving. |
| Looks | Draw pixels, lines, rectangles and circles, set pen and fill colour, pen width and font, next row, clear row, console print and clear, colour sensor light, touch LED brightness and fade. |
| Sound | Play a note with octave/duration, or any of the 16 built-in sounds, including Siren 2, Ratchet 2, Alarm 2 and Power Down. |
| Sensing | Brain (battery, button, cursor, timer), touch LED, colour sensor, distance sensor, gyro, inertial and optical sensor blocks. |
| Functions | Your own functions, with number inputs and an optional number result. |
| Lists (Python) | List blocks. They exist only in Python mode; in C++ mode they leave a comment. |
| Raw Python | A raw statement, a raw value, a raw `if`, a raw `while`, and a bitwise AND, OR, XOR and shift. The text you type is copied as it is, so in C++ mode it must be C++. |
| Console | Print with/without a newline, clear, font colours, numeric precision, ask and wait, answer as text/number, screen print precision, and live show/hide value monitors. |
| Pneumatics | Extend/retract either cylinder or both, and turn the pump on/off. |
| Motor groups | Configure two/four motors, then use the motor actions and reporters on the group. Motor reversal follows individual motor setup blocks. |
| Vision | Configure calibrated signatures, snapshot signatures/colour codes, select an object, count/exists, dimensions, position and angle. |
| AI Vision | Configure colours and colour codes, snapshot colours/codes/AprilTags/model objects, toggle detection modes, select an object, read dimensions/position/angle/score/classification/tag ID. |
| Data, Lists, 2D lists | Boolean variables and named numeric/text lists in both languages, initial items, length/shape, replace and read. Indexing starts at 1; dimensions are bounded to 64 × 64. |
| Useful | Map a value between ranges, clamp, and joystick deadband. |
| Switch | Raw Boolean/number reporters and a raw startup stack, alongside the existing raw statements and C-shaped controls. |

The hardware block families are checked against the [VEXcode IQ2 block reference](https://api.vex.com/iq2/home/blocks/index.html) and the installed IQ2 Python stubs/C++ headers. Vision requires sensor calibration: paste exported signature/colour values into setup blocks, and configure AI models in VEX's Vision Utility. Merely selecting a port does not calibrate a sensor. Hardware-specific sensing needs the corresponding connected device. Console monitors sample a global variable or sensor reporter every 250 ms and display up to 32 named readings; local function parameters/loop variables are unsupported. GPS is outside the IQ2 block reference. The original **Lists (Python)** category remains Python-only; the new named **Lists** and **2D lists** categories support both languages.

The live console uses the IQ2's separate USB user port; when connected, downloads and program control explicitly target the discovered admin port while the console keeps listening. VM installation pauses and reconnects the console because it can reset the USB connection. Failed transfers include port diagnostics (the apps holding the port on macOS; whether the brain's ports are present on Windows and Linux); version errors include the detected brain firmware and SDK target, rather than assuming firmware is outdated. Transfers that have started are not retried automatically. If the console cannot connect, running a program reports a visible warning that output may be missed.

## How it works

```
 browser page (Blockly blocks + code box)
        │  code, slot, name
        ▼
 local server (server.js, Node, 127.0.0.1 only)
        ├── Python:  main.py ───────────────► vexcom --slot N --write main.py
        └── C++:     main.cpp ─► make + clang ─► iqraw.bin ─► vexcom --slot N --write iqraw.bin
                                                              │ USB
                                                              ▼
                                                        VEX IQ 2nd gen brain
```

- **The page** (`public/index.html`) uses Google's Blockly library to draw the blocks. The files `public/iq-blocks.js` (Python) and `public/iq-cpp.js` (C++) turn each block into code. Both live in the page, so what you see in the code box is exactly what gets sent.
- **The server** (`server.js`) is a small local web server. It runs VEX's own tools for device discovery, downloads and execution. The optional live console uses `serialport` to open only the brain user port discovered by `vexcom`, at 115200 baud, and streams text to the browser through server-sent events.
- **`vexcom`** is VEX's download tool. It ships inside VEX's VS Code extension, and on first start the server copies it to `~/.iq-raw/vexcom`. It speaks the brain's USB protocol, packages Python programs the way the brain expects, and writes the program into the slot. This is why iq-raw does not need its own copy of the protocol.
- **C++ builds** use VEX's own SDK, clang compiler and project makefile, taken from the same VS Code extension. The server unpacks VEX's empty IQ (2nd gen) C++ project into a temporary folder, drops your `main.cpp` in, runs `make`, and sends the `.bin` it produces. The temporary folder is deleted afterwards.
- **Pins:** the Python on the brain has no pin calls. The C++ SDK does: `vexGenericDigitalEnable`, `vexGenericDigitalOutput`, `vexGenericDigitalInput`, `vexDigitalPinGet`, `vexAnalogPinGet`. The headers do not explain what the pin number and options mean. The one-block "write to prong of port N" uses enable options 0 and pin 0 as a starting guess.
- **Safety:** the server listens on 127.0.0.1 only, checks the Host and Origin of every request, and accepts only JSON, because anything that can reach it can overwrite programs on a brain. Your work is also saved in the browser (localStorage), per language.

### Files

- `server.js` : local server, runs `vexcom` and the C++ build.
- `zip.js` : unpacks VEX's C++ project template, so no `unzip` program is needed.
- `public/index.html` : the editor page and its buttons.
- `public/iq-blocks.js` : block definitions, the Python generator, the toolbox.
- `public/iq-cpp.js` : the C++ generator.
- `public/iq-catalog.js` : the table of most IQ blocks (label, Python and C++ for each); both generators are built from it.
- `public/iq-vex.js` : console, pneumatics, motor groups, Vision/AI Vision, data, lists and additional control/operator blocks.
- `public/editor-ui.js`, `public/console-renderer.js`, `serial-console.js` : drag-only toolbox, fullscreen/panel controls, and the live USB console.
- `TROUBLESHOOTING.md`, `public/help.html`, `public/help.js`, `public/markdown.js`, `public/troubleshoot.js` : the troubleshooting guide, the in-app Help page that renders it, and the rules that link console errors to its sections.
- `test/*.test.mjs` : check generator output, server guards, numerical math, starter/drag/fullscreen behavior, and mocked serial I/O/ANSI rendering. Catalog and added VEX blocks are generated with every dropdown option, Python is parsed, and C++ is compiled against VEX's SDK when installed. Run with `npm test`. Serial mocks do not substitute for physical-brain console testing.

## Testing with a real brain

Nothing here has run on hardware yet. For someone with an IQ (2nd gen) brain:

1. Install as above, plug the brain in, open the page, press **Check brain**.
2. Python: press **Install Python VM**, **Probe brain API**, then **Download and run** the starter program.
3. C++: press **Build only**, then **Download and run**. Try the "write high to prong of port N" block with a multimeter or an LED on that port.
4. Report what the options and pin numbers need to be, and anything that errors, with the text from the log box.

Not checked on a brain: the Python for every block. It follows VEX's block docs and parses, but no Python interpreter ran it. A few Python names are from memory because the docs don't show them: the `ColorSensor` and `Gyro` constructors, and `SmartDrive` with a wheel size. The C++ is checked by compiling against VEX's SDK headers.

## Limits

- macOS is the most tested. Windows and Linux use the same VEX tools from the same extension. Their tool discovery and build steps are covered by tests with stand-in tools, but have not run against a real brain or VEX's real compiler yet. After a failed transfer, macOS names the apps holding the brain's USB ports; Windows and Linux only report whether the brain's ports are present and which they are.
- IQ 2nd generation only. The 1st generation brain has no Python and a different protocol.
- Needs VS Code and VEX's extension for `vexcom` and the C++ SDK. They are VEX's software and are not included here.
