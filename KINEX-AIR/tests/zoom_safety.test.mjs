import test from 'node:test';
import assert from 'node:assert/strict';
import {GestureMachine} from '../gestures.js';

const base=()=>({index:{x:.5,y:.3},point:true,palmOpen:false,zoom:false,zoomContinuity:false,
  pinchTouch:false,scroll:false,clutch:false,pinch:1.4,scrollY:.6,
  curled:{index:false,middle:true,ring:true,pinky:true}});
const pinched=(p=.30)=>({...base(),point:false,zoom:true,zoomContinuity:true,pinchTouch:true,pinch:p});
const spread=(p=1.2)=>({...pinched(p),zoom:false,pinchTouch:false});
const actions=(o,type)=>o.actions.filter(a=>a.type===type);

test('pointer continues without zoom when thumb is extended',()=>{
 const m=new GestureMachine(),f=base();
 m.update(f,0);assert.equal(m.update(f,120).mode,'POINTER');
 for(let t=150;t<=2000;t+=50){
   const o=m.update({...f,index:{x:.5+.1*Math.sin(t/80),y:.3}},t);
   assert.equal(actions(o,'zoom').length,0);
 }
});
test('brief pinch cannot trigger zoom',()=>{
 const m=new GestureMachine();
 for(const [t,dist] of [[0,.28],[100,.31],[210,.34],[250,.30]]){
   const o=m.update(pinched(dist),t);
   assert.equal(o.mode,'ZOOM_ARMING');assert.deepEqual(actions(o,'zoom'),[]);
 }
 assert.notEqual(m.update(base(),310).mode,'ZOOM');
 assert.equal(actions(m.update(spread(1.6),550),'zoom').length,0);
});
test('only a stable 500 ms pinch unlocks zoom, then deliberate motion controls direction',()=>{
 const m=new GestureMachine();
 for(const t of [0,90,200,350,480]){
   const o=m.update(pinched(.3),t);
   assert.equal(o.mode,'ZOOM_ARMING');assert.deepEqual(actions(o,'zoom'),[]);
 }
 assert.equal(m.update(pinched(.3),520).mode,'ZOOM');
 assert.deepEqual(actions(m.update(spread(.43),610),'zoom'),[]);
 let o=m.update(spread(.66),720);
 assert.equal(actions(o,'zoom')[0]?.direction,1);
 assert.equal(actions(o,'zoom')[0]?.steps,1);
 m.update(spread(.52),830);o=m.update(pinched(.26),920);
 assert.equal(actions(o,'zoom')[0]?.direction,-1);
});
test('finger jitter does not cause runaway zoom',()=>{
 const m=new GestureMachine();
 for(const t of [0,125,250,375,500])m.update(pinched(.3),t);
 const offsets=[.008,-.008,.014,-.009,.006,-.013,.008,-.004];
 let t=560;
 for(const d of offsets){
   assert.equal(actions(m.update(pinched(.3+d),t+=100),'zoom').length,0);
 }
});
test('hand movement during zoom arming restarts the hold',()=>{
 const m=new GestureMachine();m.update(pinched(),0);
 m.update({...pinched(),index:{x:.75,y:.3}},220);
 m.update({...pinched(),index:{x:.75,y:.3}},340);
 m.update({...pinched(),index:{x:.75,y:.3}},460);
 assert.equal(m.update({...pinched(),index:{x:.75,y:.3}},560).mode,'ZOOM_ARMING');
 assert.equal(m.update({...pinched(),index:{x:.75,y:.3}},740).mode,'ZOOM');
});
test('returning to pointer pose reliably exits zoom',()=>{
 const m=new GestureMachine();
 for(const t of [0,100,250,400,510])m.update(pinched(),t);
 let o=m.update(base(),580);assert.equal(o.mode,'ZOOM');
 assert.deepEqual(actions(o,'zoom'),[]);
 assert.equal(m.update(base(),790).mode,'IDLE');
 m.update(base(),900);assert.equal(m.update(base(),990).mode,'POINTER');
});
test('index-curl click is preserved independently of zoom',()=>{
 const m=new GestureMachine(),f=base();m.update(f,0);m.update(f,180);
 const fist={...f,point:false,curled:{index:true,middle:true,ring:true,pinky:true},
   pinchTouch:true,zoom:true};
 assert.deepEqual(m.update(fist,260).actions,[{type:'click'}]);
 assert.equal(m.update(fist,290).actions.length,0);
});
test('two-finger scroll and palm safety pause are preserved',()=>{
 const m=new GestureMachine(),f={...base(),point:false,scroll:true};
 m.update(f,0);m.update(f,120);
 assert.equal(m.update({...f,scrollY:.5},230).actions[0]?.type,'scroll');
 assert.equal(m.update({...f,palmOpen:true},260).actions.length,0);
 assert.equal(m.update({...f,palmOpen:true},960).actions[0]?.type,'pause');
});
test('tracking loss discards pending zoom arm',()=>{
 const m=new GestureMachine();
 m.update(pinched(),0);m.update(pinched(),300);m.update(null,350);
 assert.equal(m.update(pinched(),650).mode,'ZOOM_ARMING');
});
