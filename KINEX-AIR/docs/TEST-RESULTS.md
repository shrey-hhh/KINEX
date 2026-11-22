# KINEX AIR — validation log

## Latest desktop-cursor diagnostic revision (November 22, 2026)

**Observed issue (reported by user):** The dashboard mirrored the Windows pointer position, but fingertip movement did not control the real system cursor. The explicit +80px real-cursor test also produced no visible movement.

**Diagnosis:** The native Windows cursor command path is not yet verified on the user's PC. The earlier test depended on the controller remaining armed while webcam tracking was active and sometimes acknowledged input without surfacing underlying Windows API errors.

**Code changes committed:** A one-shot `POST /api/cursor-test` test works without starting webcam or arming gesture control; cursor movement checks its actual result; Win32 failures return a useful error; virtual-desktop coordinates support multiple monitors. Escape blocks the test, and the main gesture controller still starts disarmed.

### Automated results
- Python controller tests: **11 passing**
- JavaScript gesture tests: **16 passing**
- Python compilation and JS syntax: **passing**
- Local HTTP smoke test: `/api/status` and `/app.js` respond successfully; native cursor test correctly reports unavailable on non-Windows environment

### Outstanding live tests
- Direct Windows +80px cursor movement: **not yet verified**
- Webcam index-to-real-pointer: **not yet verified**
- Zoom, click, scroll under real conditions: **not yet verified**
- End-to-end latency and tracking reliability: **not measured**

**Next test:** Close existing KINEX AIR processes. Download the updated `KINEX-AIR/` GitHub folder from the main branch. Start `START_WINDOWS.bat` and open `http://127.0.0.1:8770/`. **Before starting the webcam**, click **Test Windows cursor (+80px)**. Capture the exact PASS/FAIL text. If it fails, run `diagnostics/cursor_probe.py` separately to distinguish native Win32 access from the HTTP bridge.
