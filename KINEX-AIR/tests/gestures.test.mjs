import test from 'node:test';
import assert from 'node:assert/strict';
import {features,GestureMachine,AdaptiveFilter,AutoCalibrator,RelativeCursor} from '../gestures.js';
function fixture(){
 const p=Array.from({length:21},()=>({x:.5,y:.8}));p[0]={x:.5,y:.9};
 const bases=[[.32,.74,.25,.70,.40,.78],[.40,.65,.40,.48,.40,.31],[.50,.65,.50,.47,.50,.31],[.60,.66,.60,.49,.60,.33],[.70,.73,.70,.57,.70,.40]];
 const starts=[1,5,9,13,17];
 for(let i=0;i<5;i++){
   const b=bases[i],s=starts[i];p[s]={x:b[0],y:b[1]};p[s+1]={x:b[2],y:b[3]};p[s+2]={x:b[2],y:(b[3]+b[4])/2};p[s+3]={x:b[4]===undefined?b[2]:b[2],y:b[4]};
 }
 // thumb tucked, index straight, others curled
 p[1]={x:.34,y:.77};p[2]={x:.31,y:.76};p[3]={x:.38,y:.72};p[4]={x:.40,y:.78};
 for(const [m,pip,dip,tip] of [[9,10,11,12],[13,14,15,16],[17,18,19,20]]){
   p[pip]={x:p[m].x,y:p[m].y-.13};p[dip]={x:p[m].x+.01,y:p[m].y-.06};p[tip]={x:p[m].x+.01,y:p[m].y+.02};
 }
 return p;
}
const baseFeatures=()=>({index:{x:.5,y:.3},point:true,palmOpen:false,zoom:false,scroll:false,pinch:1,scrollY:.6,curled:{index:false,middle:true,ring:true,pinky:true}});
test('index-only pose recognized as pointer',()=>{
 const f=features(fixture());assert.equal(f.point,true);assert.equal(f.zoom,false);assert.equal(f.scroll,false);
});
test('pointer activates after stability interval',()=>{
 const m=new GestureMachine(),f=baseFeatures();
 assert.equal(m.update(f,0).mode,'IDLE');assert.equal(m.update(f,190).mode,'POINTER');
 assert.equal(m.update(f,191).actions[0].type,'move');
});
test('index curling clicks once, not repeatedly and not without previous point',()=>{
 const m=new GestureMachine(),f=baseFeatures();m.update(f,0);m.update(f,170);
 const fist={...f,point:false,curled:{index:true,middle:true,ring:true,pinky:true}};
 assert.deepEqual(m.update(fist,260).actions,[{type:'click'}]);
 assert.equal(m.update(fist,280).actions.length,0);
 const fresh=new GestureMachine();assert.equal(fresh.update(fist,100).actions.length,0);
});
test('zoom separation increase and decrease generate opposite commands',()=>{
 const m=new GestureMachine(),f={...baseFeatures(),point:false,zoom:true,pinch:.3};
 m.update(f,0);m.update(f,250);m.update({...f,pinch:.38},300);let out=m.update({...f,pinch:.51},500);
 assert.equal(out.actions.find(a=>a.type==='zoom').direction,1);
 m.update({...f,pinch:.43},700);out=m.update({...f,pinch:.25},900);
 assert.equal(out.actions.find(a=>a.type==='zoom').direction,-1);
});
test('scrolling hand up causes negative wheel direction',()=>{
 const m=new GestureMachine(),f={...baseFeatures(),point:false,scroll:true,scrollY:.6};
 m.update(f,0);m.update(f,260);const out=m.update({...f,scrollY:.51},300);
 assert.ok(out.actions.find(a=>a.type==='scroll').ticks<0);
});
test('open palm requires sustained hold and triggers only once until released',()=>{
 const m=new GestureMachine(),f={...baseFeatures(),point:false,palmOpen:true};
 assert.equal(m.update(f,0).actions.length,0);assert.equal(m.update(f,600).actions.length,0);
 assert.equal(m.update(f,700).actions[0].type,'pause');assert.equal(m.update(f,1200).actions.length,0);
 m.update({...f,palmOpen:false},1250);m.update(f,1300);
 assert.equal(m.update(f,1990).actions[0].type,'pause');
});
test('low confidence suppresses commands',()=>{
 const m=new GestureMachine(),f=baseFeatures();m.update(f,0,.8);m.update(f,200,.8);
 assert.equal(m.update(f,250,.2).actions.length,0);
});
test('adaptive filter removes some step discontinuity',()=>{
 const filt=new AdaptiveFilter();filt.step({x:0,y:0},0);
 const p=filt.step({x:1,y:1},17,.5);assert.ok(p.x>0&&p.x<1);
});
test('calibration bounds inferred from broad motion and defaults for stationary samples',()=>{
 const c=new AutoCalibrator();c.begin(0);
 for(let i=0;i<30;i++)c.sample({x:.1+i*.025,y:.2+i*.02},i*190);
 assert.equal(c.sample({x:.9,y:.82},6010),'calibrated');
 assert.ok(c.map({x:.5,y:.5}).x>0&&c.map({x:.5,y:.5}).x<1);
 c.begin(8000);for(let i=0;i<30;i++)c.sample({x:.5,y:.5},8000+i*150);
 assert.equal(c.sample({x:.5,y:.5},14020),'fallback');
});

test('relative cursor anchors without jumping and produces tiny precise steps',()=>{
 const c=new RelativeCursor(),b={left:.10,right:.90,top:.12,bottom:.88};
 assert.equal(c.step({x:.5,y:.5},0,b).active,false);
 const p=c.step({x:.502,y:.5},33,b,'balanced');
 assert.ok(p.active && p.dx>0 && p.dx<.004,'near-tab movement should be small');
 c.reset();
 assert.equal(c.step({x:.90,y:.1},1000,b).active,false,'re-center must not teleport cursor');
 const q=c.step({x:.902,y:.1},1033,b,'balanced');
 assert.ok(q.active&&q.dx>0&&q.dx<.004);
});
test('speed acceleration makes fast motion travel farther than equal-sized slow motion',()=>{
 const b={left:.10,right:.90,top:.10,bottom:.90};
 const c1=new RelativeCursor();c1.step({x:.30,y:.4},0,b);
 const slow=c1.step({x:.32,y:.4},200,b,'balanced',1);
 const c2=new RelativeCursor();c2.step({x:.30,y:.4},0,b);
 const fast=c2.step({x:.32,y:.4},20,b,'balanced',1);
 assert.ok(fast.dx>slow.dx);
});
test('precision profile moves less than rapid profile for same input',()=>{
 const b={left:.1,right:.9,top:.1,bottom:.9};
 const p=new RelativeCursor(),r=new RelativeCursor();
 p.step({x:.4,y:.4},0,b);r.step({x:.4,y:.4},0,b);
 const a=p.step({x:.406,y:.4},33,b,'precision');
 const z=r.step({x:.406,y:.4},33,b,'rapid');
 assert.ok(a.dx<z.dx);
});
test('tracking loss and large landmark jumps create no displacement',()=>{
 const b={left:.1,right:.9,top:.1,bottom:.9};
 const c=new RelativeCursor();c.step({x:.3,y:.3},0,b);
 assert.equal(c.step({x:.9,y:.9},33,b).active,false);
 assert.equal(c.step({x:.91,y:.9},600,b).active,false);
});
test('clutch pose cannot trigger pointer commands and clears click readiness',()=>{
 const m=new GestureMachine(),f=baseFeatures();m.update(f,0);m.update(f,180);
 const clutch={...f,point:false,clutch:true};
 assert.equal(m.update(clutch,210).actions.length,0);
 assert.equal(m.update(clutch,420).mode,'CLUTCH');
 assert.equal(m.update(clutch,450).actions.length,0);
 const fist={...f,point:false,clutch:false,curled:{index:true,middle:true,ring:true,pinky:true}};
 assert.equal(m.update(fist,500).actions.length,0,'no stale click after clutch');
});

test('zoom remains active during separation and reports directions separately',()=>{
 const m=new GestureMachine();
 const f={...baseFeatures(),point:false,zoom:true,zoomContinuity:true,pinch:.30};
 m.update(f,0);m.update(f,150);const first=m.update({...f,pinch:.43},190);
 let o=m.update({...f,zoom:false,pinch:.64},280);
 assert.equal(o.mode,'ZOOM');
 assert.ok([first,o].some(x=>x.actions.some(a=>a.type==='zoom'&&a.direction===1)));
 m.update({...f,zoom:false,pinch:.55},420);
 o=m.update({...f,zoom:false,pinch:.37},500);
 assert.equal(o.actions.find(a=>a.type==='zoom')?.direction,-1);
});
test('short deliberate movements are not blocked by a large zero-motion deadzone',()=>{
 const c=new RelativeCursor(),bounds={left:.10,right:.90,top:.10,bottom:.90};
 c.step({x:.5,y:.5},100,bounds);
 const v=c.step({x:.501,y:.5},133,bounds,'precision');
 assert.equal(v.active,true);
 assert.ok(v.dx>0);
});
