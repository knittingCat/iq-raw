(() => {
  // Maps tool output to the TROUBLESHOOTING.md section that explains it. The first matching rule wins, so specific
  // messages come before the generic exit-code rules. Anchors are checked against the guide by test/help.test.mjs.
  const RULES = [
    [/Cannot reach the iq-raw server/, 'the-page-will-not-load-or-looks-broken', 'The page will not load or looks broken'],
    [/Bluetooth|pair an IQ2 brain|four-digit code|No usable Python VM/, 'bluetooth', 'Bluetooth'],
    [/setup-preview|preview has no compiler|WASI SDK/, 'brain-preview-and-program-tree', 'Brain preview and program tree'],
    [/vexcom was not found/, 'vexcom-was-not-found', 'vexcom was not found'],
    [/C\+\+ tools were not found|Could not unpack VEX's project template/, 'c-builds', 'C++ builds'],
    [/No IQ brain console port|Could not open the brain console|console is paused|Connect the brain console|Console connection failed/, 'live-console', 'Live console'],
    [/No code to (send|build)|Slot must be/, 'downloading-slots-and-names', 'Downloading, slots and names'],
    [/\[timed out\]|terminated by SIG/, 'an-action-times-out', 'An action times out'],
    [/exited with code 5\b|Brain: not found/, 'brain-not-found', 'Brain not found'],
    [/exited with code [246]\b/, 'the-brain-is-busy-or-the-port-is-in-use', 'The brain is busy or the port is in use'],
    [/exited with code [38]\b/, 'version-error-code-3', 'Version error (code 3)'],
    [/exited with code [17]\b/, 'download-fails-with-code-1', 'Download fails with code 1'],
    [/exited with code -1\b/, 'vexcom-was-not-found', 'vexcom was not found'],
    [/\berror:|make: \*\*\*/, 'c-builds', 'C++ builds'],
  ];
  function match(text) {
    for (const [pattern, anchor, title] of RULES) if (pattern.test(text)) return { anchor, title };
    return { anchor: 'start-here', title: 'Start here' };
  }
  window.IQHelp = { match, anchors: RULES.map((r) => r[1]).concat('start-here') };
})();
