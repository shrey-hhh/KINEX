import {features,GestureMachine,AdaptiveFilter,AutoCalibrator,RelativeCursor} from './gestures.js';
const $=id=>document.getElementById(id);
const video=$('video'),overlay=$('overlay'),ctx=overlay.getContext('2d');
const machine=new GestureMachine(),filter=new AdaptiveFilter(),cal=new AutoCalibrator(),cursor=new RelativeCursor();
const joints=[[0,1],[0,5],[0,9],[0,13],[0,17],[5,9],[9,13],[13,17],[1,2],[2,3],[3,4],[5,6],[6,7],[7,8],[9,10],[10,11],[11,12],[13,14],[14,15],[15,16],[17,18],[18,19],[19,20]];
let detector=null,visionAPI=null,stream=null,active=false,armed=false,paused=true,token='';
let lastVideo=-1,lastFrame=0,lastHand=0,lastHeartbeat=0,lastMove=0,lastStatus=0;
let frameCount=0,rateStart=0,log=[],timings=[],lastValid=null,processing=false;
let pendingMove=false,lastCommand='—',serverMessage='',lastState='DISARMED',previewX=.5,previewY=.5;
let queuedDX=0,queuedDY=0;
let trackedFrames=0,movementFrames=0,moveSent=0,moveAccepted=0,moveRejected=0;
let lastPointerError='none';
let lastZoomDirection='—',lastZoomTime=0;
let diagnosticPalmSince=null,diagnosticPalmLatched=false,diagnosticLastHand=null;
const pointerOnly=$('pointerOnly');
function resetDiagnostic(){diagnosticPalmSince=null;diagnosticPalmLatched=false;diagnosticLastHand=null;}
function diagnosticGesture(f,valid,now){
 const out={mode:'LOW_CONFIDENCE',actions:[]};
 if(!valid||!f){resetDiagnostic();return out;}
 if(f.palmOpen){
  out.mode='PALM';diagnosticLastHand=null;
  if(diagnosticPalmSince===null)diagnosticPalmSince=now;
  if(now-diagnosticPalmSince>=650&&!diagnosticPalmLatched){out.actions.push({type:'pause'});diagnosticPalmLatched=true;}
  return out;
 }
 diagnosticPalmSince=null;diagnosticPalmLatched=false;
 // Deliberately follow the detected index TIP even if finger-pose classification
 // fails: this isolates webcam tracking from gesture recognition for diagnosis.
 // Only active after the user explicitly arms Windows control.
 out.mode='POINTER';out.actions.push({type:'move',position:f.index});return out;
}
function message(s){$('message').textContent=s;}
function pipeline(){
  $('pipeline').textContent=`Tracked frames: ${trackedFrames} | finger movement frames: ${movementFrames} | sent: ${moveSent} | acknowledged: ${moveAccepted} | rejected: ${moveRejected}`;
  $('pointerError').textContent=lastPointerError;
}

function setState(s){lastState=s;$('state').textContent=s;$('state').className='tag '+(s==='ACTIVE'?'active':'warn');}
function controls(){
 $('armBtn').disabled=!active||cal.active||armed;
 $('pauseBtn').disabled=!armed;
 $('testBtn').disabled=false;
 $('cameraBtn').textContent=active?'Stop webcam':'Start webcam';
 $('csvBtn').disabled=log.length===0;
 $('calBtn').disabled=!active;
}
function statusFromServer(d){
 armed=!!d.armed&&!d.paused;paused=!!d.paused;
 setState(armed?'ACTIVE':d.armed?'PAUSED':'DISARMED');
 $('bridge').textContent=`Bridge: ${d.reason} · ${d.width}×${d.height} · ${d.windows?'Windows':'Preview-only platform'}`;
 $('count').textContent=d.commands;
 $('realCursor').textContent=`${Math.round(d.cursor_x*(d.width-1))}, ${Math.round(d.cursor_y*(d.height-1))} px`;
 $('osState').textContent=d.windows?'Windows desktop API connected':'Not running on Windows';
 if(d.last_cursor_error) $('pointerError').textContent=d.last_cursor_error;
 if(Number.isFinite(d.cursor_x)&&Number.isFinite(d.cursor_y)){previewX=d.cursor_x;previewY=d.cursor_y;}
 if(!armed){cursor.reset();queuedDX=queuedDY=0;}
 controls();
}
async function post(path,payload={}){
 try{
  const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','X-Kinex-Token':token},body:JSON.stringify(payload),cache:'no-store'});
  const d=await r.json();statusFromServer(d);
  if(!r.ok)throw Error(d.message||d.error||'Request rejected');
  return true;
 }catch(e){serverMessage=e.message; if(path!='/api/input')message('Bridge: '+e.message);return false;}
}
async function input(command){
 if(!armed)return false;
 const ok=await post('/api/input',command);
 if(ok)lastCommand=command.type;
 return ok;
}
async function pollStatus(){
 try{
  const r=await fetch('/api/status',{cache:'no-store'});const d=await r.json();
  token=d.token;statusFromServer(d);return true;
 }catch(e){message('Start with START_WINDOWS.bat, not by opening index.html directly. '+e.message);return false;}
}
async function startCamera(){
 if(active)return stopCamera();
 $('cameraBtn').disabled=true;message('Loading hand tracking library…');
 try{
  if(!navigator.mediaDevices?.getUserMedia)throw Error('Webcam access requires localhost or HTTPS.');
  if(!visionAPI){
   const base='https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21';
   visionAPI=await import(base+'/vision_bundle.mjs');
   const files=await visionAPI.FilesetResolver.forVisionTasks(base+'/wasm');
   const opts={baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'},runningMode:'VIDEO',numHands:1,minHandDetectionConfidence:.5,minHandPresenceConfidence:.5,minTrackingConfidence:.5};
   try{detector=await visionAPI.HandLandmarker.createFromOptions(files,{...opts,baseOptions:{...opts.baseOptions,delegate:'GPU'}});}
   catch(e){detector=await visionAPI.HandLandmarker.createFromOptions(files,opts);}
  }
  stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{width:{ideal:640},height:{ideal:480},frameRate:{ideal:30}}});
  video.srcObject=stream;await video.play();active=true;processing=false;
  $('placeholder').hidden=true;$('cameraStatus').textContent='LIVE · image processed in browser';
  machine.reset();filter.reset();cursor.reset();resetDiagnostic();queuedDX=queuedDY=0;lastVideo=-1;lastHand=0;
  cal.active=false;cal.message='Relative cursor control ready (calibration optional)';updateCalibration();
  message('Camera live. Use the one-click Windows cursor test at any time, then enable controls and try Pointer-only mode.');
  requestAnimationFrame(loop);
 }catch(e){message('Camera setup failed: '+e.message);stopCamera();}
 finally{$('cameraBtn').disabled=false;controls();}
}
function stopCamera(){
 active=false;stream?.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;
 if(armed)post('/api/pause');
 $('placeholder').hidden=false;$('cameraStatus').textContent='Camera offline';
 machine.reset();filter.reset();cursor.reset();resetDiagnostic();queuedDX=queuedDY=0;lastValid=null;
 controls();message('Camera stopped. Mouse control paused.');
}
function startCalibration(){
 if(armed)post('/api/pause');
 cal.begin(performance.now());$('calStatus').textContent='CALIBRATING — 6 s';
 machine.reset();filter.reset();cursor.reset();resetDiagnostic();queuedDX=queuedDY=0;controls();
}
function draw(points){
 const w=video.videoWidth||960,h=video.videoHeight||720;
 if(overlay.width!==w||overlay.height!==h){overlay.width=w;overlay.height=h;}
 ctx.clearRect(0,0,w,h);
 if(!points)return;
 ctx.lineWidth=3;ctx.strokeStyle='rgba(75,228,189,.75)';
 for(const [a,b] of joints){ctx.beginPath();ctx.moveTo(points[a].x*w,points[a].y*h);ctx.lineTo(points[b].x*w,points[b].y*h);ctx.stroke();}
 for(let i=0;i<points.length;i++){
  ctx.beginPath();ctx.fillStyle=i===8?'#ffbd7b':'#d7f2ff';
  ctx.arc(points[i].x*w,points[i].y*h,i===8?8:4,0,Math.PI*2);ctx.fill();
 }
}

function updateGestures(mode){
 $('gesture').textContent=mode.replaceAll('_',' ');
 document.querySelectorAll('.gesture[data-mode]').forEach(el=>el.classList.toggle('active',el.dataset.mode===mode));
}
function updateCalibration(){
 $('calStatus').textContent=cal.active?'CALIBRATING — '+Math.max(0,Math.ceil((cal.start+6000-performance.now())/1000))+'s':cal.message;
 const b=cal.bounds;
 $('boundsText').textContent=`Mapping X ${(b.left*100).toFixed(0)}–${(b.right*100).toFixed(0)}% · Y ${(b.top*100).toFixed(0)}–${(b.bottom*100).toFixed(0)}%`;controls();
}
function addLog(now,gesture,f,confidence,latency,command,px,py,motion){
 if(!$('record').checked)return;
 if(log.length>=20000){log.shift();}
 log.push({time_ms:Math.round(now),mode:gesture,confidence:confidence.toFixed(4),
  fingertip_x:f?f.index.x.toFixed(5):'',fingertip_y:f?f.index.y.toFixed(5):'',
  pointer_x:px===null?'':px.toFixed(5),pointer_y:py===null?'':py.toFixed(5),
  pinch_palm_units:f?f.pinch.toFixed(4):'',inference_ms:latency.toFixed(2),
  profile:$('profile').value,acceleration:$('acceleration').value,
  cursor_gain:motion?motion.gain.toFixed(3):'',finger_speed:motion?motion.speed.toFixed(4):'',
  cursor_delta_x:motion?motion.dx.toFixed(6):'',cursor_delta_y:motion?motion.dy.toFixed(6):'',command});
 if(log.length===1)$('csvBtn').disabled=false;
}
function plot(){
 const c=$('chart'),g=c.getContext('2d'),w=c.width,h=c.height;
 g.clearRect(0,0,w,h);
 g.strokeStyle='#34516b';g.lineWidth=1;
 for(let y=20;y<h;y+=20){g.beginPath();g.moveTo(0,y);g.lineTo(w,y);g.stroke();}
 if(timings.length<2)return;
 g.strokeStyle='#48e4bb';g.lineWidth=2;g.beginPath();
 timings.forEach((t,i)=>{const x=i/(timings.length-1)*w,y=h-Math.min(80,t)/80*h;if(i===0)g.moveTo(x,y);else g.lineTo(x,y);});g.stroke();
}
function exportCSV(){
 const keys=['time_ms','mode','confidence','fingertip_x','fingertip_y','pointer_x','pointer_y','pinch_palm_units','inference_ms','profile','acceleration','cursor_gain','finger_speed','cursor_delta_x','cursor_delta_y','command'];
 const rows=[keys.join(','),...log.map(row=>keys.map(k=>String(row[k]??'')).join(','))].join('\r\n');
 const u=URL.createObjectURL(new Blob([rows],{type:'text/csv;charset=utf-8'}));
 const a=document.createElement('a');a.href=u;a.download='kinex-air-experiment-'+new Date().toISOString().replace(/[:.]/g,'-')+'.csv';a.click();
 setTimeout(()=>URL.revokeObjectURL(u),3000);
}
async function loop(now){
 if(!active)return;
 requestAnimationFrame(loop);
 if(processing||video.readyState<2||lastVideo===video.currentTime)return;
 processing=true;lastVideo=video.currentTime;
 try{
  const t0=performance.now(),result=detector.detectForVideo(video,t0),infer=performance.now()-t0;
  timings.push(infer);if(timings.length>100)timings.shift();
  frameCount++;if(!rateStart)rateStart=now;
  if(now-rateStart>800){$('fps').textContent=(frameCount*1000/(now-rateStart)).toFixed(1)+' Hz';frameCount=0;rateStart=now;plot();}
  $('infer').textContent=infer.toFixed(1)+' ms';
  const hand=result.landmarks?.[0]||null;
  const confidence=result.handedness?.[0]?.[0]?.score||0;
  $('conf').textContent=hand?(confidence*100).toFixed(0)+'%':'—';
  draw(hand);
  const f=features(hand),threshold=Number($('minConfidence').value)/100;
  const valid=!!f&&confidence>=threshold;
  if(valid){trackedFrames++;if(trackedFrames%8===0)pipeline();}
  $('poseDebug').textContent=f?`INDEX FINGERTIP: ${f.index.x.toFixed(3)}, ${f.index.y.toFixed(3)} · Index: ${f.fingers.index?'extended':'bent'} · Other fingers: ${f.curled.middle&&f.curled.ring&&f.curled.pinky?'curled':'not all curled'} · Pinch: ${f.pinch.toFixed(2)} palm units`:'No hand detected';
  if(valid)lastHand=now;
  if(armed&&now-lastHand>900){
    await post('/api/pause');message('Safety pause: tracking lost. Show your hand and explicitly enable controls again.');
  }
  let actionLabel='',mapped=null,motionLog=null;
  if(cal.active){
    cal.sample(valid && f.point ? f.index:null,now);
    if(!cal.active){message(cal.message+'. Select Enable cursor control when ready.');filter.reset();machine.reset();cursor.reset();}
    updateCalibration();updateGestures('CALIBRATING');
  }else{
    const output=pointerOnly.checked?diagnosticGesture(f,valid,now):machine.update(f,now,confidence,threshold);
    updateGestures(output.mode);
  $('fingerMotion').textContent=f?`${Math.round(f.index.x*100)}%, ${Math.round(f.index.y*100)}%`:'No hand';
    let relative=null;
    if(valid && f && output.mode==='POINTER' && (pointerOnly.checked || f.point) && f.index.x>.02 && f.index.x<.98 && f.index.y>.02 && f.index.y<.98){
      // Smooth image-space landmarks, not absolute desktop coordinates.
      const smoothed=filter.step(f.index,now,Number($('response').value)/100);
      relative=cursor.step(smoothed,now,cal.bounds,$('profile').value,Number($('acceleration').value)/100);
      motionLog=relative;
      $('gainReadout').textContent='Current motion gain: '+relative.gain.toFixed(2)+'× · finger speed '+relative.speed.toFixed(2)+'/s';
    }else{
      // Clutch or lost gesture? Reset the finger anchor, never the OS cursor.
      filter.reset();cursor.reset();queuedDX=queuedDY=0;
      if(!valid)$('gainReadout').textContent='Hand lost or uncertain — movement held';
      if(output.mode==='CLUTCH')$('gainReadout').textContent='CLUTCH ACTIVE · cursor held in place';
    }
    mapped={x:previewX,y:previewY};
    if(lastZoomTime && now-lastZoomTime<650)$('zoomReadout').textContent='ZOOM '+lastZoomDirection;
    else $('zoomReadout').textContent=output.mode==='ZOOM'?'ZOOM READY · move thumb and index apart/together':'No zoom command';
    // Preserve fractional travel when the camera produces frames faster than
    // the HTTP bridge can accept commands. Never accumulate outside POINTER.
    if(relative?.active){queuedDX+=relative.dx;queuedDY+=relative.dy;movementFrames++;}
    // Crucially, send pointer movement independently of the multi-gesture state
    // machine's emitted actions. Otherwise a gesture transition can swallow the
    // actual desktop movement while the dashboard still updates its preview.
    if(armed && output.mode==='POINTER' && relative?.active &&
       now-lastMove>22 && !pendingMove && Math.hypot(queuedDX,queuedDY)>.000025){
       lastMove=now;pendingMove=true;
       const dx=Math.max(-.075,Math.min(.075,queuedDX));
       const dy=Math.max(-.075,Math.min(.075,queuedDY));
       queuedDX-=dx;queuedDY-=dy;moveSent++;pipeline();
       input({type:'move_relative',dx,dy}).finally(()=>{pendingMove=false;});
    }
    for(const a of output.actions){
      actionLabel+=a.type+';';
      if(a.type==='pause'){
        if(armed){await post('/api/pause');message('Open-palm safety pause. Use Enable cursor control to resume.');}
      }else if(!armed)continue;
      else if(a.type==='move'){
        // Movement is dispatched independently above.
      }else if(a.type==='click')input({type:'click'});
      else if(a.type==='scroll')input({type:'scroll',ticks:a.ticks});
      else if(a.type==='zoom'){
        lastZoomDirection=a.direction>0?'IN':'OUT';lastZoomTime=now;
        $('zoomReadout').textContent='ZOOM '+lastZoomDirection;
        input({type:'zoom',direction:a.direction,steps:a.steps});
      }
    }
  }
  // A heartbeat is deliberately distinct from tracking: the camera-loss
  // interlock above still stops the controller despite a working network link.
  if(armed && now-lastHeartbeat>260){lastHeartbeat=now;input({type:'heartbeat'});}
  if(now-lastStatus>750){lastStatus=now;pollStatus();}
  addLog(now,cal.active?'CALIBRATING':$('gesture').textContent,f,confidence,infer,actionLabel,mapped?.x??null,mapped?.y??null,motionLog);
 }catch(e){message('Hand tracking error: '+e.message);if(armed)post('/api/pause');stopCamera();}
 finally{processing=false;}
}
$('cameraBtn').addEventListener('click',startCamera);
$('calBtn').addEventListener('click',startCalibration);
$('armBtn').addEventListener('click',async()=>{
 if(!active||cal.active)return;
 if(performance.now()-lastHand>1250){message('Show your index finger to the webcam before enabling cursor control.');return;}
 if(await post('/api/arm'))message('Windows control ACTIVE. Move your index finger with Pointer-only diagnostic selected.');
});
$('pauseBtn').addEventListener('click',async()=>{await post('/api/pause');message('Paused by dashboard.');});
$('csvBtn').addEventListener('click',exportCSV);
$('response').addEventListener('input',()=>{$('responseText').textContent=$('response').value+'%';});
$('acceleration').addEventListener('input',()=>{$('accelerationText').textContent=$('acceleration').value+'%';});
$('profile').addEventListener('change',()=>{filter.reset();cursor.reset();queuedDX=queuedDY=0;});
pointerOnly.addEventListener('change',()=>{machine.reset();resetDiagnostic();filter.reset();cursor.reset();queuedDX=queuedDY=0;message(pointerOnly.checked?'POINTER DIAGNOSTIC: any tracked index fingertip moves the REAL Windows cursor. Other gestures temporarily off except open-palm pause.':'FULL GESTURE MODE: index-only pose required for cursor control.');});
$('testBtn').addEventListener('click',async()=>{
 // Explicit, one-shot native Windows test: does not require webcam or arm.
 $('testBtn').disabled=true;
 try{
   const r=await fetch('/api/cursor-test',{
     method:'POST',headers:{'Content-Type':'application/json','X-Kinex-Token':token},
     body:'{}',cache:'no-store'
   });
   const d=await r.json();statusFromServer(d);
   const detail=d.message||d.error||'Unknown Windows bridge error';
   $('pointerError').textContent=d.ok?'none':detail;
   message(d.ok?'PASS: '+detail+' on your REAL Windows desktop pointer.':'FAIL: '+detail);
 }catch(e){$('pointerError').textContent=String(e);message('Cursor test unavailable: '+e.message+'. Start with START_WINDOWS.bat.');}
 finally{$('testBtn').disabled=false;}
});
$('minConfidence').addEventListener('input',()=>{$('confidenceText').textContent=$('minConfidence').value+'%';});
window.addEventListener('pagehide',()=>{if(armed)fetch('/api/disarm',{method:'POST',headers:{'Content-Type':'application/json','X-Kinex-Token':token},body:'{}',keepalive:true}).catch(()=>{});});
window.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();if(armed)post('/api/pause');}});
pollStatus().then(ok=>{if(ok)message('Bridge ready. Start webcam to initialize hand tracking.');});
