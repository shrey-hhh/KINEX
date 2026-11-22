# v0.3 Desktop integration verification (first required test)

1. Launch `START_WINDOWS.bat` and confirm Python's localhost console is open and dashboard says Windows desktop API connected.
2. Start webcam, extend index, confirm POINTER and a sufficiently high tracking rate.
3. Enable control. Press **Test real cursor (+80px)** and observe the real Windows pointer move while the dashboard's coordinate readback changes.
4. Only if that succeeds, test natural index-finger mouse movement in a normal browser window, then zoom in/out separately.
5. Report observations with screenshot of bridge state, tracking Hz, and gesture label. Do not claim webcam or Windows tests passed based on synthetic code tests alone.

# Experimental validation plan — NOT YET PERFORMED

Keep OS mouse control disarmed while inspecting detected gestures.
Repeat each trial at multiple lighting levels and hand–camera distances.

## 1. Gesture confusion matrix
Present each of the five requested gestures 20 times, holding each for 2 s,
with a balanced set of neutral hand movements. Compare recognized vs expected
classes. Report per-class precision, recall and false activations per minute.

## 2. Pointing performance
Use 12 targets at three screen distances. Record target acquisition time,
final pointing error (pixels) and unintended clicks. Compare responsiveness
settings 20%, 55%, 90% under the same lighting and setup.

## 3. Stationary jitter and temporal lag
Hold pointing finger stationary for 20 s; compute RMS and peak-to-peak cursor
jitter from exported numeric CSV. For lag, record matched webcam and screen
motion externally at sufficient frame rate; inference time is NOT end-to-end
latency. Estimate lag using cross-correlation, with uncertainty intervals.

## 4. Zoom, scroll, and click reliability
Perform 20 cycles each of pinch spread, pinch close, index curl, scroll up,
scroll down. Measure correct direction, duplicate commands and time-to-trigger.

## 5. Safety validation
- Startup: ensure no mouse event occurs until `Enable cursor control`.
- During tracking: press Esc while pointing: input must stop immediately.
- Open palm hold: pause after approximately 0.65 s, no automatic resume.
- Occlude the hand for >0.8 s: inputs stop and manual re-arm required.
- Close browser while armed: watchdog pauses after <=1 s.
- Attempt unexpected input payload: bridge rejects it.

## Data management
CSV saves only when the Export button is clicked. Record date, camera model,
monitor size, hand distance, lighting and software version in a separate lab
notebook. Keep raw data; do not substitute simulation for observed results.


## v0.2 precision-vs-travel verification

1. Run with cursor control disarmed; confirm POINTER, CLUTCH, SCROLL, ZOOM
   recognition and that open palm signals PAUSE.
2. Arm, select Precision, and move the index by a small amount toward the
   adjacent browser tab. Log whether a small displacement produces a controllable
   few-pixel move rather than a screen-wide jump.
3. Select Rapid and repeat the *same physical distance* at faster movement speed;
   compare cursor displacement. Do not report exact gain without measurements.
4. While in POINTER, raise index+middle+ring (pinky bent), reposition the hand
   toward camera center, return to POINTER and check that cursor does not jump.
5. Deliberately move the hand out of frame. Verify the cursor freezes and the
   safety pause engages by the existing tracking-loss timeout.
6. For each profile, try 20 nearby-tab selections and 20 long-distance target
   selections, counting time, errors, tracking loss, accidental clicks, and
   reposition cycles. Log limitations alongside any metrics.
7. Confirm global Escape pauses the bridge and new movements only resume after
   an explicit dashboard action.

## v0.4 fingertip-to-Windows isolation test
1. Enable Pointer-only diagnostic, start webcam and verify index fingertip numeric coordinates change with your finger, not your mouse.
2. Arm control, press Test real cursor (+80px) and verify the actual Windows arrow shifts.
3. Move your index finger. Record whether SENT COMMANDS increases and whether the Windows cursor follows.
4. Only after success, disable diagnostic and evaluate full gestures separately.
