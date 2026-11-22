# KINEX AIR — Real Windows webcam mouse (development version)

Gesture-driven **actual Windows desktop cursor**, not a simulated pointer. This is a local-first, no-purchase HCI experiment based on the MediaPipe approach in the [KINEX robotics project](https://github.com/shrey-hhh/KINEX). No Arduino or servo is necessary.

> **Status:** User confirmed real Windows cursor movement. Click, pinch-zoom and scrolling have new recognition fixes, but have not yet been confirmed on the user's webcam. Automated tests passed; actual gesture quality must be tested on Windows.

## Desktop multitasking (Chrome/Edge, November 2026)

**Why this change:** Browsers normally suspend `requestAnimationFrame` when a tab is hidden, so KINEX AIR used to stop processing webcam frames as soon as the user switched to another tab or application. The application now schedules hand inference with a timer, and its Python launcher opens a dedicated Chromium app window with a separate browser profile and app-specific background-throttling settings.

1. Close the old KINEX AIR dashboard and Python terminal completely.
2. Update the **existing** GitHub checkout (`git pull`), or download the current KINEX repository ZIP and **Extract All** to replace the older local copy.
3. Run `KINEX-AIR/START_WINDOWS.bat`. Keep the terminal open. Chrome is preferred; Edge is the fallback. A **separate KINEX AIR desktop window** should open instead of a normal browser tab.
4. In this dedicated window, click **Start webcam**, allow camera access to `127.0.0.1` (the new dedicated browser profile may ask again), and click **Enable cursor control**.
5. Keep the dedicated KINEX AIR window **open** (it may be behind other windows). Switch to a different Chrome tab, File Explorer, or another normal Windows app. Test pointing, clicking, scrolling and zooming on that app. Start with windows overlapping rather than minimizing the KINEX window; minimized background behavior depends on Chrome/Windows.
6. Press **Esc** from anywhere to stop control. If tracking stops or the computer sleeps, the bridge's heartbeat watchdog pauses commands. Return to KINEX AIR and explicitly enable control again.

**Important limitations:** This is **best-effort browser-based background processing**, not a guaranteed invisible background service. Chrome/Edge can still suspend camera/video work when minimized or under particular power policies. The dedicated Chrome/Edge launch flags affect **only this isolated KINEX AIR browser profile**, not the user's normal browser. No new software packages or hardware purchases are required if Python and Chrome or Edge are already installed. If no supported browser is detected, the launcher falls back to a regular tab, which may pause while inactive.

**Verification:** The code changes passed 25 JavaScript tests and 13 Python tests in local automated checks. The behavior when the dedicated window is not focused **has not yet been physically verified on the user's Windows laptop**.

## Launch on Windows

1. Close previous KINEX AIR browser tabs and server/console windows. You may also close old KINEX sessions that are using the webcam.
2. Unzip **all** files into one folder. Do not double-click `index.html` or run the project through GitHub Pages; browser sandboxing prevents direct OS pointer control.
3. Double-click `START_WINDOWS.bat` (Python 3 must be available; no packages required). **Leave the command window open.**
4. The local server opens **http://127.0.0.1:8770/** automatically. Verify that the dashboard says **Windows desktop API connected** (rather than Preview-only).
5. Before starting the webcam, click **Test Windows cursor (+80px)**. The Windows mouse pointer should move slightly; the dashboard now shows the observed pixel displacement or a concrete Windows API error. Then click **Start webcam**. Hand landmark dots should appear on video. Six-second calibration is **optional** for relative movement; you can start right away.
6. Keep **Pointer-only diagnostic UNCHECKED** (default). Click **Enable cursor control** after the webcam sees your hand. All five gestures are now enabled. Only check Pointer-only when troubleshooting cursor movement; it explicitly disables click, zoom, and scroll.
7. Before testing gestures, confirm **Test Windows cursor (+80px)** worked even with gesture control disabled. Look at your real mouse pointer on the Windows desktop: it should move about 80 pixels horizontally. The diagnostic displays actual coordinates from `GetCursorPos`.
8. First test index-only pointing, then curl that index finger to click once. For zoom, curl middle/ring/pinky and extend the thumb + index, spreading them to zoom in and approaching them to zoom out; for scrolling, extend index + middle and move the whole hand vertically. Watch the **CURRENT GESTURE** label and **Last Windows gesture command** readout. If a Windows command is accepted but nothing happens, move the pointer over a scrollable/zoomable application.
9. If you want to isolate pointer tracking later, check **Pointer-only diagnostic**, and uncheck it to resume all gestures.
10. **Press Esc anywhere to pause.** An open palm held 0.65 seconds also pauses. Use the dashboard to re-enable.

### Direct Windows bridge check — no login or password required

**Do not share passwords, remote-access codes, API tokens, or the `token` field from `/api/status`.** This program does not require any account authentication to control your own PC. The browser and its local Python server negotiate a temporary session token automatically.

1. Use the **latest** copy of this GitHub repository on your Windows laptop. Close old KINEX AIR tabs and Python consoles. Run `KINEX-AIR/START_WINDOWS.bat` and leave the black Python console open. It must show `KINEX AIR available at http://127.0.0.1:8770`. If it shows an exception or closes, the bridge is not running.
2. Open **exactly** `http://127.0.0.1:8770/` in Chrome or Edge. Do not use GitHub Pages, a `file://` HTML page, or the older KINEX port 8765. Confirm the panel says **Windows desktop API connected**.
3. With the webcam still off, click **Test Windows cursor (+80px)**. The result should show `PASS` with observed displacement, or `FAIL` with a specific message. The command runs without enabling gesture control.
4. If the test fails, open a Command Prompt in the `KINEX-AIR` folder and run `py diagnostics\\cursor_probe.py` (or `python diagnostics\\cursor_probe.py`). This standalone test directly calls Windows `SetCursorPos`, moves briefly, and restores the position. It does not use the browser, webcam, or any third-party packages.
5. Report the **PASS/FAIL line from the dashboard**, the **PASS/FAIL line from the standalone probe**, and whether the black server console shows any error. Do not paste the full `/api/status` response because it contains the local session token.

Interpretation: probe PASS + dashboard FAIL means the local HTTP/browser bridge needs repair; probe FAIL means Windows rejected or blocked pointer movement in the current desktop session. Neither outcome is fixed by providing GitHub authorization.

### If the Windows cursor does not move

- If the dashboard says **Preview-only**, you're not running on Windows. The bridge needs Windows; nothing here runs as a system mouse inside an ordinary website.
- If **Test real cursor** fails, verify you launched `START_WINDOWS.bat` and can see its running Python console. Close other copies of KINEX AIR. Check any startup error in the console window, then reopen the current GitHub version at **127.0.0.1:8770**.
- If **Test real cursor** works but finger motion does not, keep **Pointer-only diagnostic** checked; check **DETECTED FINGERTIP** coordinates, landmark overlay, hand confidence, CURRENT GESTURE, and tracking frequency. If the landmark dot and numerical coordinates do not follow your index fingertip, the problem is in camera tracking. If they change but **SENT COMMANDS** does not increase, the problem is gesture-to-bridge movement logic. If commands increase but Windows does not move, the problem is the Windows bridge.
- If the finger works only in diagnostic mode but not full mode, a gesture classifier is incorrectly rejecting your pointing pose or prioritizing zoom. We can then tune that separately from the Windows bridge.
- If camera tracking is slow (e.g. under 10 Hz), close competing webcam software and check Chrome/Edge hardware acceleration. This model's inference speed depends on the PC.
- If `ZOOM` rarely appears: extend both thumb and index, curl the other three fingers, and begin zoom motion after the dashboard confirms ZOOM. The gesture HUD labels IN and OUT separately when a command fires.
- If controls pause due to tracking loss or Esc, re-enable explicitly. The app does not resume automatically.
- If the Windows cursor moves in a privileged app but not another, try targeting a normal desktop browser window. We do not escalate privileges.

## Gestures

| Gesture | Desktop action |
|---|---|
| Index extended, middle/ring/pinky curled | Real Windows mouse movement (relative, accelerated) |
| Start pointing, then curl index | One real left click |
| Thumb and index touching, then moving apart | Zoom **in** via Ctrl+wheel |
| Thumb and index separated, then moving together | Zoom **out** via Ctrl+wheel |
| Index + middle extended, hand up/down | Scroll down/up (user-chosen inversion) |
| Index + middle + ring extended | Clutch: hold mouse still to re-center your hand |
| Open palm held ~0.65 s | Safety pause |
| Esc key anywhere in Windows | Emergency safety pause |

Zoom relies on application support for Ctrl+mouse wheel and may differ between apps. All gestures can be logged numerically to CSV. No video is sent to the bridge.

## Engineering changes through v0.4

- **Optional Pointer-only diagnostic**: while enabled, any confidently detected hand moves the real Windows pointer according to its index fingertip, independent of index-extended recognition; click, zoom, and scroll are intentionally inactive in this test mode. Open-palm and Esc safety pauses remain active.
- Shows numerical fingertip coordinates beside Windows cursor coordinates so users can identify which end of the pipeline is failing.
- Desktop-cursor verification: Windows API cursor position readback and direct 80-pixel movement test.
- Removed misleading simulated pointer UI. Actual Windows coordinates are displayed instead.
- Separate zoom-in and zoom-out HUD indications; pinch continuity and hysteresis to preserve direction as fingers spread or approach.
- Faster relative cursor gains, reduced smoothing delay and pointer activation time.
- Webcam requested at 640×480 to improve processing throughput on some systems.
- Six-second calibration is optional, not mandatory; calibration remains available from the dashboard.
- Dedicated localhost port 8770 prevents silent collisions with older v0.1/v0.2 servers on 8767.
- Start script keeps the Python server window visible, opens browser automatically, and surfaces errors rather than blindly opening a potentially stale server.

## Source code and validation

- `app.js`: webcam and UI, MediaPipe, command transport, telemetry and CSV export.
- `gestures.js`: landmark geometry, gesture state machine and smoothing/acceleration.
- `server.py`: local Python standard-library Windows input bridge, safety interlocks and cursor readback.
- `tests/`: automated classification and backend tests (mock Windows cursor for server tests).
- `docs/`: algorithm and validation notes.

Commands are restricted to loopback with a session token and same-origin checks. The service starts disarmed, and it stops on missing heartbeats, lost tracking, Esc, or an open-palm pause. Internet is required to load MediaPipe. This is an engineering prototype; false gestures, hand-occlusion failures, and device-specific lag require measurement.


## Desktop cursor diagnostic pipeline (latest GitHub revision)
The dashboard now records **tracked frames**, **finger movement frames**, **sent Windows cursor commands**, **acknowledged commands** and **rejected commands**. Movement dispatch is independent of the full-gesture action list so it is less likely to be lost during transitions. Failed bridge calls now show a readable error. This is a testable code change, **not yet a confirmed fix on the user's computer**.

Source of truth is GitHub: subsequent fixes are committed to this same `KINEX-AIR/` project folder rather than issued as differently named ZIP releases. Restart the local server and hard-refresh the page after pulling changes.

## Windows bridge correction — direct diagnostic

The one-shot `POST /api/cursor-test` request is protected by the same localhost session token and browser origin check as the gesture commands, but does **not** depend on the camera, hand tracking, or controller arm state. The bridge checks actual Win32 cursor position before and after movement, reports the observed displacement and propagates native Windows errors. The cursor adapter supports a multi-monitor virtual desktop instead of silently clamping to the primary display. Esc blocks the test.

Use **Test Windows cursor (+80px)** immediately after starting the local server, **before** starting the webcam. If the test reports `FAIL`, capture the exact message and use `diagnostics/cursor_probe.py` for a second direct Windows API check. This is a diagnostic update, not a claim of successful testing on the user's Windows computer.

## Gesture recognition fix — November 22, 2026

- Fixed root cause of pointing-only behavior: the Pointer-only diagnostic checkbox is now **off by default**, allowing all five gestures.
- Clicking now takes precedence immediately after a valid index-only point and is no longer blocked by a transient pinch classification.
- Zoom recognition distinguishes an intentionally outstretched thumb and keeps tracking through pinch changes. Zoom-in and zoom-out are derived from the sign of thumb–index separation change.
- Two-finger scrolling tracks average palm motion and uses lower, gated thresholds. User direction: **hand up → scroll down**.
- UI displays the most recent acknowledged or rejected click/scroll/zoom command. These indicate bridge acceptance, not guaranteed behavior of every target application.
- 22 JavaScript gesture tests and 11 Python bridge tests passed locally. Physical webcam validation remains pending.

**Updating your local copy:** GitHub commits do not magically replace the folder already extracted to your PC. Download/extract the latest source or use `git pull` if you cloned the repository with Git. Close the previous Python server and restart `START_WINDOWS.bat` from the updated `KINEX-AIR` folder, then hard-refresh the dashboard. Always check that Pointer-only diagnostic is **unchecked**.

### Repeatable automated tests

With Node.js installed, run `npm test` from the `KINEX-AIR` folder to execute the gesture tests. With Python installed, run `python -m unittest discover -s tests -p 'test_*.py'` to exercise the mocked Windows bridge. These checks do not replace testing with a real webcam and Windows cursor.
