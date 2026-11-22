import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('hand tracking does not depend on foreground paint callbacks',async()=>{
  const code=await readFile(new URL('../app.js',import.meta.url),'utf8');
  assert.match(code,/function scheduleTracking\(\)/);
  assert.match(code,/setTimeout\(\(\)=>loop\(performance\.now\(\)\),16\)/);
  assert.doesNotMatch(code,/requestAnimationFrame\(loop\)/);
});

test('background schedule is cleared when camera stops',async()=>{
  const code=await readFile(new URL('../app.js',import.meta.url),'utf8');
  assert.match(code,/function stopCamera\(\)\s*\{[^}]*clearTimeout\(trackingTimer\)/);
});

test('desktop bridge launches the dedicated app and keeps Windows emergency pause',async()=>{
  const code=await readFile(new URL('../server.py',import.meta.url),'utf8');
  assert.match(code,/launch_desktop\(\)/);
  assert.match(code,/--disable-background-timer-throttling/);
  assert.match(code,/--disable-backgrounding-occluded-windows/);
  assert.match(code,/Emergency pause: Escape key/);
});
