# KINEX AIR — Gesture-Controlled Windows Cursor

**Project status:** Active prototype, v0.4 under real-PC validation.

KINEX AIR is a webcam-based human-computer interaction prototype built on the hand-tracking work in [KINEX](https://github.com/shrey-hhh/KINEX). Its goal is to control the **actual Windows system cursor**, not only a browser preview, using MediaPipe hand landmarks and a localhost Python bridge.

## Design goals
- Index fingertip: cursor movement with adjustable acceleration and smoothing.
- Curl index after pointing: single left click.
- Thumb and index move apart: zoom in.
- Thumb and index move together: zoom out.
- Two-finger mode, move hand vertically: scrolling in the user's chosen direction.
- Three-finger clutch: reposition hand without cursor movement.
- Open-palm safety pause and global Esc emergency pause.
- Track confidence, command rate, tracking loss, and gesture events; export CSV data.

## Engineering architecture
1. The webcam feeds MediaPipe hand tracking in the browser.
2. A gesture state machine filters transient motions and chooses a command.
3. A Python localhost bridge relays commands to the Windows input API.
4. Safety interlocks disarm the bridge on interruption and require explicit reactivation.

## Current test
Version 0.4 includes a **Pointer-only diagnostic** that intentionally disables click/scroll/zoom recognition to isolate fingertip movement. The dashboard also offers a direct **Test real cursor (+80px)** button. The user's latest observation was that a display mirrored Windows cursor position, but fingertip movement did not yet control it reliably. Hardware-in-the-loop validation on the user's own laptop is pending.

## Validation criteria
1. The real Windows cursor moves during the +80px direct test.
2. Detected fingertip coordinates change correctly with index movement.
3. Pointer-only mode moves the actual Windows cursor.
4. Full gesture mode distinguishes zoom-in from zoom-out.
5. Emergency pause immediately stops all new pointer actions.
6. CSV records tracking losses, frame/command rates, and gesture transitions.

## Publication note
This document records the project and outstanding testing. **The full v0.4 application source is not yet checked into this GitHub folder**; the current test package is in the associated ChatGPT project conversation. Do not consider this repository path a complete installable release until source files are added and the Windows tests are verified.

## Version history
- v0.1: initial five-gesture prototype
- v0.2: relative pointer movement, profiles and clutch
- v0.3: Windows cursor diagnostics, zoom and latency improvements
- v0.4: pointer-only diagnostic to isolate fingertip tracking and command delivery
