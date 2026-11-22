> v0.3 note: cursor gain/smoothing and gesture stability thresholds have changed since this original design note. The source in `gestures.js` is authoritative; real-device tuning is still required.

# Algorithm and control design — v0.2

## Raw inputs
MediaPipe's hand landmark detector returns 21 normalized image landmarks.
Use fingertip index 8 for pointer, thumb tip 4 for pinch, middle MCP 9 and wrist 0
for palm reference. Landmark x is mirrored before mapping to desktop x.

`palm = ||landmark[0] - landmark[9]||`; normalized pinch separation is
`||landmark[4]-landmark[8]|| / palm`. Palm normalization reduces sensitivity
to changing apparent hand size, but does not eliminate perspective effects.

For straight finger detection, inspect joint angle at PIP and the tip–MCP
separation relative to PIP–MCP separation. Curl is the complementary criterion
with hysteresis. All decisions are heuristics awaiting camera validation.

## Debounced state machine
Modes: IDLE, POINTER, CLICK (instant event), ZOOM, SCROLL, PALM.
Mode candidates must persist for 130 ms (point) or 220 ms (zoom/scroll).
Open palm needs 650 ms and is latched until release. Click requires prior
stable pointer evidence within 500 ms and a 650 ms refractory period.
Mode priority: pause, click transition, zoom, scroll, pointer, idle.

## Adaptive cursor filter
The smoothing is a speed-adaptive low-pass filter inspired by the One Euro
family. With sampling interval `dt` and cutoff `fc`:

`alpha = dt / (dt + 1/(2*pi*fc))`

`x_filtered = x_previous + alpha*(x_raw - x_previous)`.

The cutoff increases with smoothed estimated pointer speed, reducing the lag
experienced during quick movements while suppressing slow stationary jitter.
The responsiveness slider changes the minimum cutoff and speed coefficient.
This is not a formally optimized controller: performance requires measurement.

## Auto-calibration
During an explicit six-second calibration, samples of normalized, mirrored
index positions are collected when the index-only gesture is recognized.
With at least 22 samples and sufficient movement range, map 4th and 96th
percentiles to screen edges with 2.5% padding. Insufficient samples or
range retains the default usable region (`x,y` in `[.12,.88]`).

`screen_x = clip((x - left)/(right-left), 0, 1)`

`screen_y = clip((y - top)/(bottom-top), 0, 1)`

Windows primary-monitor coordinates are then calculated by the local bridge.
The automatic procedure does not calibrate real-world centimeters or 3D depth.
As of v0.2 these bounds normalize **movement displacement**, not absolute
screen position; this avoids teleports and enables clutching.

## Zoom and scroll
While the ZOOM mode is active, accumulated normalized thumb–index separation
change triggers a discrete `Ctrl+wheel` step each 0.16 palm units, rate-limited
to one burst per 160 ms. Increase means zoom in; decrease means zoom out.
While SCROLL is active, upward 2D hand movement accumulates negative wheel
ticks (scroll down, as specified), with a threshold of 0.045 frame units.
Normal pointer input is disabled in both modes.

## Confidence and limitations
The displayed confidence is MediaPipe's **handedness classification score**.
This is NOT calibrated probability of gesture correctness or landmark precision.
The value is used only as a pragmatic gate. A more rigorous classifier would
incorporate landmark temporal stability, tracking uncertainty and a measured
confusion matrix. Occlusion, lighting, hand depth and thumb pose can affect
recognition. Reliability claims must await real testing.

## Safety and privacy
Input runs exclusively through a locally bound HTTP server using a session
key, with explicit arming, a global Escape emergency stop, 0.8-s tracking-loss
pause and a 1-s heartbeat timeout. Browser video is processed locally and
not sent to the bridge. Local CSV records numeric positions, statuses and
timing only. No passive recording is enabled beyond in-memory numeric logs.

## v0.2 velocity-adaptive relative cursor control

The v0.1 absolute mapping was replaced by relative control to improve small-target
precision and support repositioning. Let `p(t)` be the filtered index fingertip
in normalized camera coordinates, `B_x` and `B_y` the calibrated usable fractions
of the image width and height, and `dt` the observation interval. With
`delta_p = p(t)-p(t-1)` and `v=||delta_p||/dt` the cursor delta is:

`delta_screen_x = (delta_p_x / B_x) * G(v)` and analogously for Y,
where the bridge multiplies the normalized displacement by primary-monitor pixels.
`G(v) = base + (peak-base)*((clamp((v-.05)/.95,0,1))^1.5)*a`.
`a` is the user acceleration strength (0 to 1.5). `base, peak` are:
precision `[0.20,1.05]`, balanced `[0.34,2.10]`, rapid `[0.55,3.30]`.
These are heuristic initial values, not measured optimum coefficients.

- An adaptive low-pass filter smooths *image coordinates before displacement*.
- First sample after pointer-mode entry establishes an anchor and sends no motion.
- Non-pointer mode, clutch, lost tracking, mode/profile changes reset the anchor.
- A `dt > 0.20 s` discontinuity or >16% frame jump rejects displacement.
- Each frame delta is capped to 7.5% of screen; backend independently validates it.
- The bridge moves from the OS cursor's current position, not a fixed absolute map,
  and accumulates fractional pixel residuals for slow movements.
- The open palm remains a latching pause. Three fingers (index, middle, ring)
  and curled pinky activate clutch after 180 ms. No cursor commands in clutch.

The technique cannot reconstruct motion outside the camera view. It is intended
for iterative evaluation against precision pointing tasks and Fitts' law metrics.
