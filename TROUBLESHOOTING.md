# Troubleshooting

Work through the section that matches what you see. Each one lists the likely causes in order, the quickest check for each, and the fix. The same guide is built into iq-raw: press **Help** in the editor, or the **How to fix** link under an error in the console.

## Start here

Most problems are one of these. Check them in order before reading further:

1. **The iq-raw server is running.** The Terminal or PowerShell window where you ran `npm start` is still open and shows `iq-raw: open http://localhost:5174`.
2. **VEX's tools are downloaded.** VS Code has the VEX extension, and you have created at least one IQ (2nd gen) C++ project with it, so it downloaded `vexcom` (and, for C++, the compiler).
3. **The brain is on and plugged in directly.** USB-C data cable, straight into the computer, brain powered on. Not through the controller, and preferably not through a hub.
4. **No other app is connected to the brain.** VEXcode IQ, VS Code's VEX extension and serial monitors all hold the brain's USB ports open.
5. **Python only: the Python VM is installed.** Press **Install Python VM** once per brain, and again after every VEXos update.

Then press **Check brain**. If it says connected, the USB path works and the problem is in the program, the build or the slot.

## Reading an error

Everything the tools print appears in the **Console** panel, newest at the bottom. A failed action ends with a red line such as `download to slot 1 failed.` Scroll up to the first red text: the first error is the cause, later ones are usually consequences.

When `vexcom` (VEX's download tool) fails, iq-raw adds a line like `vexcom exited with code 5 (device not found…)`. The code tells you which section to read:

| Exit code | Meaning | Read |
|---|---|---|
| -1 | The tool could not be started at all, or was stopped after its time limit | [vexcom was not found](#vexcom-was-not-found), [An action times out](#an-action-times-out) |
| 1 | The operation failed and the tool gave no reason | [Download fails with code 1](#download-fails-with-code-1) |
| 2 | Communication with the brain failed | [The brain is busy or the port is in use](#the-brain-is-busy-or-the-port-is-in-use) |
| 3 | A version mismatch between the tool, the brain and the runtime | [Version error](#version-error-code-3) |
| 4 | The brain rejected or did not understand a command | [The brain is busy or the port is in use](#the-brain-is-busy-or-the-port-is-in-use) |
| 5 | No brain found | [Brain not found](#brain-not-found) |
| 6 | The serial port could not be opened or used | [The brain is busy or the port is in use](#the-brain-is-busy-or-the-port-is-in-use) |
| 7 | An option iq-raw passed was not accepted | [Download fails with code 1](#download-fails-with-code-1) |
| 8 | VEXos reported an error | [Version error](#version-error-code-3) |

After codes 2 to 6, iq-raw also checks the USB ports. macOS names any other app that has them open. Windows and Linux report whether the brain's ports (USB vendor ID 2888) are present and which they are.

`terminated by SIGTERM` (or another signal) means the tool was stopped from outside, usually by the time limit. iq-raw never retries a transfer that had started, because repeating a half-finished write is riskier than asking you to retry.

## The server will not start

**`node` or `npm` is not recognized / command not found.** Node is not installed, or the window was opened before it was. Install Node 18 or newer (`winget install -e --id OpenJS.NodeJS.LTS` on Windows, `brew install node` on macOS), then open a new Terminal or PowerShell window. Check with `node --version`.

**`npm install` fails while building `serialport`.** `serialport` ships prebuilt binaries for common systems, so this usually means an unusual Node version or CPU. Use the current LTS version of Node, delete the `node_modules` folder, and run `npm install` again. On Linux, installing your distribution's build tools (`build-essential` or equivalent) and `python3` lets it compile from source.

**`port 5174 is already in use`.** Another iq-raw is probably already running: open http://localhost:5174 and use it, or close the other window. To run on another port, start with `PORT=5175 npm start` (macOS/Linux) or `$env:PORT=5175; npm start` (PowerShell). Your saved blocks are stored per address, so a different port starts with an empty workspace. See [My blocks or code disappeared](#my-blocks-or-code-disappeared).

**`Cannot find module …`.** Dependencies are missing. Run `npm install` in the iq-raw folder, then `npm start`.

## The page will not load or looks broken

**The browser says it cannot connect.** The server is not running. Start it with `npm start` and keep that window open.

**`Forbidden`.** iq-raw answers only on `http://localhost:<port>` and `http://127.0.0.1:<port>`, so nothing else on your network or a web page you visit can send programs to your brain. Use exactly one of those two addresses. A network IP, a custom hostname or a proxy is refused on purpose.

**The page loads but has no blocks or toolbox.** The Blockly library was not installed. Run `npm install`, restart the server and reload the page. If it persists, open the browser's developer console (F12) and look for a red error naming a file.

**`Cannot reach the iq-raw server` in the console.** The page is open but the server stopped (the window was closed or it crashed). Start it again with `npm start`. Nothing on the page is lost: your work is saved in the browser.

## vexcom was not found

`vexcom` is VEX's own tool for talking to the brain. iq-raw does not include it; it takes it from VEX's VS Code extension.

1. **Install the extension:** `code --install-extension vexrobotics.vexcode`, or search for "VEX" by VEX Robotics in VS Code's Extensions view.
2. **Let it download its tools.** Installing is not enough. Open VS Code, press Cmd+Shift+P (Ctrl+Shift+P on Windows and Linux), run the VEX **New Project** command and create an **IQ (2nd gen) C++** project. Wait until its downloads finish.
3. **Press Check brain again.** No restart is needed; iq-raw searches each time.

Where iq-raw looks, in order:

1. The `VEXCOM` environment variable, if set.
2. Its own copy in `~/.iq-raw/vexcom` (on Windows, `C:\Users\<you>\.iq-raw\vexcom`).
3. The extension's download folder: `tools/vexcom/<version>/<platform>` inside VS Code's storage. That is `~/Library/Application Support/Code/User/globalStorage/vexrobotics.vexcode` on macOS, `%APPDATA%\Code\User\globalStorage\vexrobotics.vexcode` on Windows, and `~/.config/Code/User/globalStorage/vexrobotics.vexcode` on Linux. It also checks VS Code Insiders, VSCodium, Cursor and Windsurf.
4. Older extension versions that bundled it under `resources/tools/vexcom`.

The error message lists every folder it checked and any VEX-looking extension folders it saw. That tells you whether the extension is installed but has not downloaded its tools yet.

**To point iq-raw at a specific vexcom**, set `VEXCOM` before starting: `VEXCOM=/path/to/vexcom npm start` (macOS/Linux) or `$env:VEXCOM="C:\path\to\vexcom.exe"; npm start` (PowerShell).

**After updating the VEX extension**, iq-raw keeps using its earlier copy in `~/.iq-raw/vexcom`. Delete that folder to make it copy the new version on the next start.

**macOS:** VEX's `vexcom` is an Intel program. On Apple Silicon, accept the prompt to install Rosetta, or run `softwareupdate --install-rosetta`. If macOS says the program "cannot be opened", open it once from Finder with right-click → Open, or allow it under System Settings → Privacy & Security.

## Brain not found

Exit code 5, or **Check brain** says `not found`.

1. **Power and cable.** Turn the brain on. Use a USB-C cable that carries data: many charging cables do not. If in doubt, try the cable that came with the kit, or one that transfers files from a phone.
2. **Connect directly.** Plug the brain straight into the computer, not into the controller and preferably not through a hub or dock.
3. **macOS:** if an **"Allow accessory to connect?"** prompt appears, click **Allow**. Until you do, the Mac lists the brain but blocks it, and tools report "Device not specified or not found". If you dismissed it, unplug and replug the brain to get the prompt again.
4. **Windows:** open Device Manager while plugging the brain in. It should appear under **Ports (COM & LPT)**. If it appears with a warning icon or under "Other devices", let Windows Update look for a driver (right-click the device → Update driver), or install VEXcode IQ, whose installer can add VEX's drivers.
5. **Linux:** your user needs access to `/dev/ttyACM*`. Run `sudo usermod -aG dialout $USER` (the group may be `uucp` on Arch), then log out and back in. `ls -l /dev/ttyACM*` shows the group that owns the ports.
6. **Prove it outside iq-raw.** Check whether VS Code's VEX extension sees the brain. If it does not either, the problem is the cable, port, driver or brain, not iq-raw.

## The brain is busy or the port is in use

Exit codes 2, 4 or 6. Only one program at a time can use the brain's USB ports.

1. **VEXcode IQ:** disconnect the brain inside VEXcode IQ, or save your work and quit it.
2. **VS Code's VEX extension:** it connects to the brain when you open a VEX project. Close that project or VS Code.
3. **Serial monitors:** Arduino IDE, PuTTY, `screen`, `minicom` and similar tools hold the port while open.
4. **iq-raw's own console** is not the cause: it listens on the brain's separate user port, and downloads and program control go to the admin port. Installing the Python VM pauses the console and reconnects it afterwards. A **second iq-raw server** (for example on another port) is a separate app, though: close it.
5. **Unplug and replug** the brain after closing the other app. Then press **Check brain** before downloading again.

On macOS the error names the apps holding the port. On Windows and Linux it lists the brain's ports so you can tell "no brain" apart from "brain present but busy".

## Version error (code 3)

`vexcom` found an incompatibility, but does not say which part. After a code 3 failure iq-raw reports the brain's VEXos version, whether the Python VM is installed, and (for C++) the VEXos version the SDK targets.

1. **Python:** reinstall the VM with **Install Python VM**. It must match the brain's VEXos and is needed again after every VEXos update.
2. **C++:** if the SDK targets a newer VEXos than the brain has, update the brain. If the brain is newer, update the VEX extension so it downloads a newer SDK.
3. **Updating VEXos:** use VEXcode IQ or VEX's firmware utility. A version error alone does not prove the firmware is outdated, so compare the numbers first.

## Download fails with code 1

Code 1 means the tool failed without a reason.

1. **Python:** the VM is probably missing. Press **Install Python VM**, wait for it to finish (up to three minutes), then download again.
2. **Interrupted transfer:** something disturbed the USB connection mid-transfer. Replug the brain, press **Check brain**, and retry by hand. iq-raw does not retry automatically.
3. **Old vexcom:** if the output mentions an unknown option, iq-raw retries once without the program name, but only if no data had been sent. If that also fails, update the VEX extension and delete `~/.iq-raw/vexcom` (see [vexcom was not found](#vexcom-was-not-found)).

## An action times out

`[timed out]` in the output means iq-raw stopped the tool after its time limit. The limits are 20 seconds for **Check brain** and **Programs on brain**, 30 seconds for run, stop and erase, 2 minutes for downloads and C++ builds, 25 seconds for the API probe, and 3 minutes for installing the Python VM.

A timeout during a download usually means the brain stopped answering: replug it, check it, retry. A timeout during a C++ build usually means the computer is very busy, or antivirus software is scanning the compiler. On Windows, adding the VEX storage folder to Defender's exclusions can help.

## Python programs

**Nothing happens after Download and run.** Only blocks attached under **when started** (or another event hat) run. A loose stack does nothing. Check the code panel: your code should appear under `# When started`.

**It runs, but prints nothing.** `print` sends text to the computer, not the brain screen. Press **Connect brain** in the Console to see it, or use the Brain → print blocks to write on the screen.

**Errors in your Python.** iq-raw does not check Python before sending, so a typo is only reported when the brain runs the program. Connect the console before running to see the brain's error message. **Probe brain API** runs a small program in slot 8 that prints what the brain's Python offers; use it when a call you expected does not exist. It overwrites whatever is in slot 8.

**Install Python VM is missing.** It only appears in Python mode. Switch the language to Python.

## C++ builds

**`The VEX IQ2 C++ tools were not found`.** iq-raw needs three things from the VEX extension: the IQ2 SDK (`sdk/cpp/IQ2/<version>`), the compiler toolchain (`tools/cpp/toolchain_<platform>`), and the empty-project template inside the extension. Create an IQ (2nd gen) C++ project in VS Code, then run VEX's **Download Toolchain** command and wait for it to finish. A ZIP file on its own is not an installed toolchain: extraction must complete.

The toolchain folder must match your system: `toolchain_osxarm64` or `toolchain_osx64` (macOS), `toolchain_win32` or `toolchain_winarm64` (Windows), `toolchain_linux64` or `toolchain_linuxarm64` (Linux). You can also place a toolchain in `~/.iq-raw/toolchains/<that name>`. To point at a non-standard VS Code storage folder, set `VEX_STORAGE` to its `vexrobotics.vexcode` folder.

**`Could not unpack VEX's project template`.** The extension's template ZIP is damaged or incomplete. Reinstall the VEX extension.

**Compiler errors.** Press **Build only** to compile without touching the brain. Read the first `error:` line; it names the file (`src/main.cpp`), the line and the column. Common causes:

- **Raw code blocks** copy your text as-is, so in C++ mode it must be C++, not Python.
- **Python-only blocks** (the original Lists category) leave a comment in C++ mode, so code that depends on them will not compile.
- **Pin blocks** only exist in C++. In Python mode they leave a comment instead.

**`make` cannot be started.** The toolchain is incomplete. Run **Download Toolchain** again.

## Downloading, slots and names

**Slots** are 1 to 8. Downloading to a slot replaces what was there. **Programs on brain** lists what is stored.

**Names** may use letters, digits, spaces, `_`, `.` and `-`, up to 32 characters. The editor marks other names as invalid; if one reaches the server anyway, the program is stored as `iq-raw`.

**`No code to send (or too long)`.** The code box is empty, or the program is over 200,000 characters.

**Download succeeded but the brain runs the old program.** Check that you selected the slot you then ran on the brain. **Download** sends without starting; **Download and run** starts it.

## Live console

**`No IQ brain console port found`.** `vexcom` did not report the brain's user port. Connect the brain directly by USB, close VEXcode's connection, and press **Check brain** first.

**`The console is paused for a brain transfer`.** The Python VM is being installed, which can reset the brain's USB connection. The console reconnects by itself when it finishes.

**`Could not open the brain console`.** Another app has the port. See [The brain is busy or the port is in use](#the-brain-is-busy-or-the-port-is-in-use).

**`Console connection failed … Program output may be missed`.** **Download and run** and **Run slot** connect the console before starting the program, so its first prints are caught. If that fails, the program still runs, but early output is lost. Fix the console error, press **Connect brain**, then run again.

**Connected, but nothing appears.** The running program is not printing, or it was started from the brain's own menu before you connected. Connect first, then run. During a build or download, program output is held back until the result (**Done.** or the failure) is shown, then appears. The console keeps the last 64 KB of output.

**Input.** The input box sends one line, ending in a newline, to the running program (for `ask` blocks). Each send is limited to 4096 bytes over USB, and to under 1000 bytes over Bluetooth.

## Bluetooth

Choose **Transfer → Bluetooth**, then **Connect Bluetooth**. Over Bluetooth the browser talks to the brain itself, without `vexcom`.

**`Bluetooth requires Chrome or Edge with Web Bluetooth support`.** Safari and Firefox do not support Web Bluetooth. Use Chrome or Edge, and turn the computer's Bluetooth on. On Linux, Chrome may also need Web Bluetooth enabled under `chrome://flags`.

**The brain does not appear in the list.** Turn it on and keep it close. Disconnect it from VEXcode IQ or any other device first, since it accepts one Bluetooth connection at a time.

**Pairing fails or `Enter the four-digit code`.** Type the code shown on the brain's screen when you connect. Codes are not saved, so you enter one each time. `Bluetooth pairing cancelled` means the chooser or code prompt was closed.

**`Connect and pair an IQ2 brain first`.** The Bluetooth link dropped or was never made. Press **Connect Bluetooth** again.

**`Bluetooth disconnected` or `Bluetooth response timed out` during a transfer.** The program may or may not be on the brain: completion was not confirmed. Move closer, reconnect, and download again.

**`failed its length or checksum check`, `Unexpected Bluetooth response`, or `Brain rejected Bluetooth command`.** The radio link garbled a message, or the brain refused a step. Reconnect and retry. If it keeps happening, update VEXos and use USB in the meantime.

**Python over Bluetooth:** `No usable Python VM found` means the brain has no Python VM. Install it once over USB with **Install Python VM**.

## Brain preview and program tree

The preview and the program tree run your program in the browser, so they need no brain. They are approximations: robot motion, sounds, fonts and timing differ from the real brain.

**`Run C++ code` asks for setup.** The local app's C++ preview needs a one-time download of the WASI SDK compiler for your system (about 180 MB on macOS and Linux, 590 MB on Windows): run `npm run setup-preview` in the iq-raw folder, then retry. It installs to `~/.iq-raw/preview`.

**`npm run setup-preview` fails.** `checksum did not match` means the download was damaged or incomplete; it is deleted, so run the command again. `download failed at byte …` means one part of the file still failed after several retries, usually because the connection dropped; run the command again. `extraction failed` on Windows means the built-in `tar.exe` is missing (Windows 10 version 1803 or later has it) or the disk is full. `No C++ preview compiler is published` means your CPU is not x64 or arm64.

**The web editor's first C++ build is slow.** The hosted editor downloads about 100 MB of compiler files the first time. Later builds reuse them.

## My blocks or code disappeared

Your blocks and code are saved in this browser's storage, separately for each address. A different browser, a private window, a different port (`PORT=5175`), or `127.0.0.1` instead of `localhost` each start empty. Go back to the address you used before.

**Edit code by hand** stops block syncing. Unticking it replaces your typed code with what the blocks make, after asking you. Save typed code with **Save code** (Ctrl+S) first if you want to keep it.

To start completely fresh, open the browser's developer tools (F12) → Application → Local Storage → `http://localhost:5174` and delete the keys starting with `iqraw.`.

## Running the tests

`npm test` runs every suite. Suites that need VEX's C++ SDK print `skip` when it is not installed. The math and catalog suites need Python 3 (`python3`, `python` or `py`); on Windows, the Microsoft Store `python3` placeholder is skipped automatically. The native math check needs a C++ compiler on `PATH`. The browser compiler has its own, slower check: `npm run test:web-compiler`.

## Reporting a problem

Include:

1. Your operating system and version, and `node --version`.
2. The full Console text: press the copy button in the Console header.
3. What **Check brain** says, and the brain's VEXos version if it shows one.
4. The output in the window running `npm start`.
5. Whether VS Code's VEX extension can see and download to the same brain.
