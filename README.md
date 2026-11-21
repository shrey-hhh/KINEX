# KINEX — Robotic Gesture Replication Lab (v1)

A browser-based prototype for estimating hand motion and visualizing an articulated robotic hand. No Arduino is required.

## Run in your browser
Once GitHub Pages is enabled for the main branch (root), open https://shrey-hhh.github.io/KINEX/. No Python or installation is needed for the hosted version. Try a demo gesture, then click **Start webcam** and grant camera permission.

## Start on Windows locally
1. Download or clone the repository and extract it if necessary.
2. Double-click `START_WINDOWS.bat`. Python 3 must be installed. Keep the server window open.
3. Chrome or Edge should open http://localhost:8765. Click a demo gesture to test the rendering, then Start webcam and grant camera permission.
4. To close: Stop camera, close the browser tab, and close the local server window.

Alternatively, run `python -m http.server 8765 --bind 127.0.0.1` (or `py -m http.server 8765 --bind 127.0.0.1` on Windows). Internet access is required to fetch Three.js, MediaPipe and the tracking model, even for the offline gesture demo (the demo does not need a camera or tracking model). Camera frames are processed in the browser; the code does not send camera frames to a server.

## What to try
- Open / fist / peace / pinch demo (approximate synthetic poses).
- Track one hand in well-lit conditions and rotate the 3D view by dragging.
- Adjust smoothing. Start a recording, move your hand, stop recording, export CSV.
- Compare raw vs filtered angle variation for a stationary hand and lag during rapid movement.

## Implementation
- MediaPipe Hand Landmarker: 21 estimated 3D world landmarks and normalized image landmarks.
- Convert to a mirrored 3D coordinate system, subtract the wrist position, scale by palm width.
- Use exponential smoothing: filtered = beta*previous + (1-beta)*current.
- Enforce fixed finger link lengths by using normalized measured link direction and a reference length.
- Interior joint bend = 180 degrees minus the angle between adjacent vectors. Dashboard shows mean of the two interior bends per digit; CSV has both angles.
- Three.js renders linked segments. This is a kinematic visualization, not a dynamics or physical actuator model.

## Limits
Monocular 3D estimates are approximate; this does not measure global wrist translation or calibrated anatomical angles. Handedness labels depend on camera/model conventions. When tracking is lost, the last pose is held and labeled lost; missing frames are not recorded. Inference duration is model execution time, not total camera-to-display latency. CSV contains detected frames only. The camera and CDN dependencies must be tested on your own computer; the development environment has no webcam.

## References
- https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker/web_js
- https://threejs.org/docs/
