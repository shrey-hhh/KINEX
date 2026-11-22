// KINEX AIR: pure, testable image-space gesture classifiers and control logic.
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const angle = (a,b,c) => {
  const ux=a.x-b.x,uy=a.y-b.y,vx=c.x-b.x,vy=c.y-b.y;
  const denom=Math.hypot(ux,uy)*Math.hypot(vx,vy);
  return denom<1e-6?0:Math.acos(clamp((ux*vx+uy*vy)/denom,-1,1))*180/Math.PI;
};
const ext=(p,mcp,pip,tip)=>angle(p[mcp],p[pip],p[tip])>145 && distance(p[tip],p[mcp])>1.33*distance(p[pip],p[mcp]);
const bent=(p,mcp,pip,tip)=>angle(p[mcp],p[pip],p[tip])<148 || distance(p[tip],p[mcp])<1.36*distance(p[pip],p[mcp]);
export function features(p){
  if(!p || p.length<21)return null;
  const palm=Math.max(.035,distance(p[0],p[9]));
  const fingers={index:ext(p,5,6,8),middle:ext(p,9,10,12),ring:ext(p,13,14,16),pinky:ext(p,17,18,20)};
  const curled={index:bent(p,5,6,8),middle:bent(p,9,10,12),ring:bent(p,13,14,16),pinky:bent(p,17,18,20)};
  const pinch=distance(p[4],p[8])/palm;
  // A deliberately extended thumb distinguishes a zoom pose from ordinary
  // one-finger pointing. A near-touch pinch also arms zoom for spreading apart.
  // Normalizing by palm length makes the distances largely camera-scale free.
  const thumbStraight=angle(p[2],p[3],p[4])>138;
  const thumbSpread=distance(p[4],p[5])/palm;
  const othersCurled=curled.middle&&curled.ring&&curled.pinky;
  const palmOpen=Object.values(fingers).every(Boolean) && distance(p[4],p[17])>1.4*palm;
  const clutch=fingers.index&&fingers.middle&&fingers.ring&&curled.pinky&&!palmOpen;
  const scroll=fingers.index&&fingers.middle&&curled.ring&&curled.pinky&&!clutch;
  const pinchTouch=pinch<.52 && (fingers.index || distance(p[8],p[5])>1.15*distance(p[6],p[5]));
  const thumbOut=thumbStraight && thumbSpread>.80;
  const zoom=othersCurled && !scroll && !clutch && (pinchTouch || (fingers.index && thumbOut && pinch<2.9));
  // Once zoom mode starts, retain it across the finger geometry transitions
  // that naturally happen when pinching apart/together.
  const zoomContinuity=othersCurled&&!scroll&&!clutch&&pinch<3.2&&(fingers.index||pinch<1.05);
  const point=fingers.index&&othersCurled&&!zoom;
  // Anchor scrolling to the palm center rather than fingertip articulation.
  const scrollY=(p[0].y+p[5].y+p[9].y+p[13].y+p[17].y)/5;
  return {palm,pinch,thumbSpread,thumbOut,pinchTouch,fingers,curled,palmOpen,clutch,zoom,zoomContinuity,scroll,point,scrollY,index:{x:1-p[8].x,y:p[8].y}};
}

// Speed-adaptive One-Euro-style filtering: stronger filtering when stationary,
// lighter filtering on rapid movement, to reduce jitter without large lag.
export class AdaptiveFilter {
  constructor(){this.reset();}
  reset(){this.last=null;this.deriv={x:0,y:0};this.ts=null;}
  step(v,now,responsiveness=.55){
    if(this.last===null){this.last={...v};this.ts=now;return {...v};}
    const dt=clamp((now-this.ts)/1000,.008,.12);this.ts=now;
    const aD=dt/(dt+1/(2*Math.PI*1.4));
    const d={x:(v.x-this.last.x)/dt,y:(v.y-this.last.y)/dt};
    this.deriv.x+=aD*(d.x-this.deriv.x);this.deriv.y+=aD*(d.y-this.deriv.y);
    const speed=Math.hypot(this.deriv.x,this.deriv.y);
    const cutoff=2.2+responsiveness*5.0+(2.0+responsiveness*10.0)*speed;
    const alpha=dt/(dt+1/(2*Math.PI*cutoff));
    this.last={x:this.last.x+alpha*(v.x-this.last.x),y:this.last.y+alpha*(v.y-this.last.y)};
    return {...this.last};
  }
}

export class AutoCalibrator {
  constructor(){this.bounds={left:.12,right:.88,top:.12,bottom:.88};this.samples=[];this.active=false;this.start=0;this.message='Default screen mapping active';}
  begin(now){this.samples=[];this.start=now;this.active=true;this.message='Move index fingertip around the usable camera area for 6 seconds';}
  sample(p,now){
    if(!this.active)return null;
    if(p&&Number.isFinite(p.x)&&Number.isFinite(p.y))this.samples.push({x:clamp(p.x,0,1),y:clamp(p.y,0,1)});
    if(now-this.start<6000)return null;
    this.active=false;
    if(this.samples.length<22){this.message='Not enough samples; using default mapping';return 'fallback';}
    const xs=this.samples.map(p=>p.x).sort((a,b)=>a-b),ys=this.samples.map(p=>p.y).sort((a,b)=>a-b);
    const q=(v,f)=>v[Math.floor((v.length-1)*f)];
    const x0=q(xs,.04),x1=q(xs,.96),y0=q(ys,.04),y1=q(ys,.96);
    if(x1-x0<.24 || y1-y0<.20){this.message='Movement range too small; using default mapping';return 'fallback';}
    this.bounds={left:clamp(x0-.025,0,.8),right:clamp(x1+.025,.2,1),top:clamp(y0-.025,0,.8),bottom:clamp(y1+.025,.2,1)};
    this.message='Automatically calibrated ('+this.samples.length+' samples)';return 'calibrated';
  }
  map(p){const b=this.bounds;return {x:clamp((p.x-b.left)/(b.right-b.left),0,1),y:clamp((p.y-b.top)/(b.bottom-b.top),0,1)};}
}

export class GestureMachine {
  constructor(){this.reset();}
  reset(){
    this.mode='IDLE';this.candidate='IDLE';this.since=0;
    this.lastPoint=-Infinity;this.lastClick=-Infinity;this.clickReady=false;this.clickHoldUntil=0;
    this.palmSince=null;this.palmLatched=false;
    this.pinchPrev=null;this.pinchAccum=0;this.zoomTick=-Infinity;
    this.scrollPrev=null;this.scrollAccum=0;this.scrollTick=-Infinity;
  }
  update(f,now,confidence=.8,minimum=.55){
    const out={mode:this.mode,actions:[],confidence,features:f};
    if(!f||confidence<minimum){
      this.mode='IDLE';this.candidate='IDLE';this.pinchPrev=null;
      this.scrollPrev=null;this.palmSince=null;this.clickReady=false;
      this.lastPoint=-Infinity;out.mode='LOW_CONFIDENCE';return out;
    }
    // Emergency palm pause takes priority over every other motion.
    if(f.palmOpen){
      if(this.palmSince===null)this.palmSince=now;
      if(now-this.palmSince>=650&&!this.palmLatched){out.actions.push({type:'pause'});this.palmLatched=true;}
      this.clickReady=false;this.pinchPrev=null;this.scrollPrev=null;
      this.mode='PALM';this.candidate='PALM';out.mode='PALM';return out;
    }
    this.palmSince=null;this.palmLatched=false;
    // Click is an EVENT, not a sustained gesture. A recent stable pointer
    // followed by curling the index finger emits exactly one click.
    // Do not require !zoom here: a closing index naturally gets near the thumb
    // and would otherwise be mistakenly classified as a zoom gesture.
    const fist=!!f.curled?.index&&!!f.curled?.middle&&!!f.curled?.ring&&!!f.curled?.pinky;
    if(this.clickReady && this.mode==='POINTER' && fist && now-this.lastPoint<=650 && now-this.lastClick>=550){
      out.actions.push({type:'click'});this.lastClick=now;this.clickReady=false;
      this.clickHoldUntil=now+350;
      this.mode='IDLE';this.candidate='IDLE';this.pinchPrev=null;this.scrollPrev=null;
      out.mode='CLICK';return out;
    }
    if(now<this.clickHoldUntil){out.mode='CLICK_COOLDOWN';return out;}
    const continuingZoom=this.mode==='ZOOM'&&f.zoomContinuity;
    const next=f.clutch?'CLUTCH':f.scroll?'SCROLL':(f.zoom||continuingZoom)?'ZOOM':f.point?'POINTER':'IDLE';
    if(next!==this.candidate){this.candidate=next;this.since=now;}
    const hold=next==='IDLE'?60:next==='POINTER'?70:next==='CLUTCH'?115:next==='ZOOM'?100:100;
    if(next!==this.mode && now-this.since>=hold){
      this.mode=next;this.pinchPrev=null;this.pinchAccum=0;
      this.scrollPrev=null;this.scrollAccum=0;
      if(next!=='POINTER')this.clickReady=false;
    }
    out.mode=this.mode;
    if(this.mode==='POINTER'&&f.point&&!f.clutch){
      this.lastPoint=now;this.clickReady=true;
      out.actions.push({type:'move',position:f.index});
    }
    if(this.mode==='ZOOM'&&(f.zoom||f.zoomContinuity)){
      if(this.pinchPrev!==null){
        const delta=f.pinch-this.pinchPrev;
        // Track signed separation changes and discard tiny landmark jitter.
        // A direction reversal clears stale motion so in/out are independent.
        if(Math.abs(delta)>.009 && Math.abs(delta)<.46){
          if(this.pinchAccum && Math.sign(delta)!==Math.sign(this.pinchAccum)&&Math.abs(delta)>.025)this.pinchAccum=0;
          this.pinchAccum+=delta;
        }
        if(Math.abs(this.pinchAccum)>=.085 && now-this.zoomTick>=70){
          const direction=this.pinchAccum>0?1:-1;
          const steps=Math.min(2,Math.max(1,Math.floor(Math.abs(this.pinchAccum)/.085)));
          out.actions.push({type:'zoom',direction,steps});
          out.zoomDirection=direction>0?'IN':'OUT';
          this.pinchAccum-=direction*steps*.085;
          this.zoomTick=now;
        }
      }
      this.pinchPrev=f.pinch;
    }
    if(this.mode==='SCROLL'&&f.scroll){
      if(this.scrollPrev!==null){
        const dy=f.scrollY-this.scrollPrev;
        if(Math.abs(dy)<.18)this.scrollAccum+=dy;
        if(Math.abs(this.scrollAccum)>=.032 && now-this.scrollTick>=85){
          const ticks=Math.min(2,Math.floor(Math.abs(this.scrollAccum)/.032));
          // Image y increases downward. The user requested hand UP -> scroll DOWN.
          out.actions.push({type:'scroll',ticks:this.scrollAccum>0?ticks:-ticks});
          this.scrollAccum-=Math.sign(this.scrollAccum)*ticks*.032;
          this.scrollTick=now;
        }
      }
      this.scrollPrev=f.scrollY;
    }
    return out;
  }
}

// Relative pointer travel. Finger position is only a local motion reference:
// releasing the pointer or entering clutch must reset the anchor. The Windows
// bridge applies finite relative displacements to the *current* OS cursor.
export class RelativeCursor {
  constructor(){this.reset();}
  reset(){this.last=null;this.ts=null;this.velocity=0;this.gain=0;}
  step(position,now,bounds,profile='balanced',acceleration=1){
    const presets={precision:[.65,2.2],balanced:[1.25,4.6],rapid:[2.0,7.0]};
    const [base,peak]=presets[profile]||presets.balanced;
    const safe={x:clamp(position.x,0,1),y:clamp(position.y,0,1)};
    if(!this.last){this.last=safe;this.ts=now;return {active:false,dx:0,dy:0,gain:base,speed:0};}
    const dt=(now-this.ts)/1000;
    const dx=safe.x-this.last.x,dy=safe.y-this.last.y;
    this.ts=now;this.last=safe;
    // A dropped camera frame or landmark jump must never trigger a cursor leap.
    if(dt<=0||dt>.20||Math.hypot(dx,dy)>.16){return {active:false,dx:0,dy:0,gain:base,speed:0};}
    const w=clamp(bounds.right-bounds.left,.24,1);
    const h=clamp(bounds.bottom-bounds.top,.20,1);
    // Speed measured in fractions of normalized camera frame per second.
    const speed=Math.hypot(dx,dy)/Math.max(.008,dt);
    const t=Math.pow(clamp((speed-.035)/.75,0,1),1.25);
    const gain=base+(peak-base)*t*clamp(acceleration,0,1.6);
    this.velocity=speed;this.gain=gain;
    if(speed<.006)return {active:false,dx:0,dy:0,gain,speed};
    return {active:true,dx:clamp(dx/w*gain,-.075,.075),dy:clamp(dy/h*gain,-.075,.075),gain,speed};
  }
}
