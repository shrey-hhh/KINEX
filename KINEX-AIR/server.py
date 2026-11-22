"""KINEX AIR local Windows mouse bridge. Python standard library only.

The bridge binds strictly to 127.0.0.1 and requires an ephemeral same-origin
session token for every command. It starts paused, uses a watchdog, and supports
an OS-wide Escape-key pause. It never captures or transmits webcam video.
"""
from __future__ import annotations
import ctypes
from ctypes import wintypes
import json
import math
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import sys
import threading
import time
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

HOST = "127.0.0.1"
PORT = 8770
ROOT = Path(__file__).resolve().parent
TOKEN = secrets.token_urlsafe(32)

class WindowsMouse:
    """Native Windows cursor adapter with checked Win32 return values.

    Virtual-desktop geometry supports secondary monitors. No cursor action is
    considered successful until Windows reports its updated position.
    """
    def __init__(self):
        self.available = sys.platform == 'win32'
        self.residual_x = self.residual_y = 0.0
        if not self.available:
            self.u = None
            return
        self.u = ctypes.WinDLL('user32', use_last_error=True)
        self.u.GetSystemMetrics.argtypes = [ctypes.c_int]
        self.u.GetSystemMetrics.restype = ctypes.c_int
        self.u.GetCursorPos.argtypes = [ctypes.POINTER(wintypes.POINT)]
        self.u.GetCursorPos.restype = wintypes.BOOL
        self.u.SetCursorPos.argtypes = [ctypes.c_int, ctypes.c_int]
        self.u.SetCursorPos.restype = wintypes.BOOL
        self.u.GetAsyncKeyState.argtypes = [ctypes.c_int]
        self.u.GetAsyncKeyState.restype = ctypes.c_short
        try: self.u.SetProcessDPIAware()
        except (OSError, AttributeError): pass

    def _geometry(self):
        if not self.available: return (0, 0, 1920, 1080)
        # Windows virtual screen includes every connected monitor.
        x = self.u.GetSystemMetrics(76)    # SM_XVIRTUALSCREEN
        y = self.u.GetSystemMetrics(77)    # SM_YVIRTUALSCREEN
        w = self.u.GetSystemMetrics(78)    # SM_CXVIRTUALSCREEN
        h = self.u.GetSystemMetrics(79)    # SM_CYVIRTUALSCREEN
        if w <= 0 or h <= 0:
            return (0, 0, max(1,self.u.GetSystemMetrics(0)), max(1,self.u.GetSystemMetrics(1)))
        return x,y,w,h

    def size(self):
        return self._geometry()[2:]

    def escape_down(self):
        return bool(self.available and (self.u.GetAsyncKeyState(0x1B) & 0x8000))

    def raw_position(self):
        if not self.available: raise RuntimeError('Windows cursor API unavailable on this platform')
        p = wintypes.POINT()
        if not self.u.GetCursorPos(ctypes.byref(p)):
            raise OSError(ctypes.get_last_error(), 'GetCursorPos failed')
        return (int(p.x),int(p.y))

    def _set_raw_position(self,x,y):
        if not self.u.SetCursorPos(int(x), int(y)):
            raise OSError(ctypes.get_last_error(), 'SetCursorPos rejected by Windows')

    def position(self):
        if not self.available:return (.5,.5)
        x,y = self.raw_position()
        vx,vy,w,h = self._geometry()
        return (max(0,min(1,(x-vx)/max(1,w-1))),max(0,min(1,(y-vy)/max(1,h-1))))

    def move(self, x,y):
        if self.available:
            vx,vy,w,h=self._geometry()
            self._set_raw_position(round(vx+max(0,min(1,x))*(w-1)),round(vy+max(0,min(1,y))*(h-1)))

    def move_relative(self,dx,dy):
        if not self.available:return
        x,y=self.raw_position()
        vx,vy,w,h=self._geometry()
        tx=max(vx,min(vx+w-1,x+dx*(w-1)+self.residual_x))
        ty=max(vy,min(vy+h-1,y+dy*(h-1)+self.residual_y))
        ix,iy=round(tx),round(ty)
        self._set_raw_position(ix,iy)
        self.residual_x=tx-ix
        self.residual_y=ty-iy

    def reset_residual(self):
        self.residual_x=self.residual_y=0.0

    def click(self):
        if self.available:
            self.u.mouse_event(0x0002,0,0,0,0)
            self.u.mouse_event(0x0004,0,0,0,0)

    def scroll(self,ticks):
        if self.available:self.u.mouse_event(0x0800,0,0,int(ticks*120),0)

    def zoom(self,direction,steps):
        if not self.available:return
        self.u.keybd_event(0x11,0,0,0)
        try:self.scroll(int(direction*steps))
        finally:self.u.keybd_event(0x11,0,0x0002,0)

class Controller:
    def __init__(self,mouse=None):
        self.mouse=mouse or WindowsMouse()
        self.lock=threading.RLock()
        self.armed=False
        self.paused=True
        self.reason='Not armed'
        self.last_heartbeat=time.monotonic()
        self.command_count=0
        self.last_cursor_error=''
    def status(self):
        with self.lock:
            w,h=self.mouse.size()
            x,y=self.mouse.position()
            return dict(cursor_x=x,cursor_y=y,armed=self.armed,paused=self.paused,reason=self.reason,
                        commands=self.command_count,width=w,height=h,windows=self.mouse.available,
                        last_cursor_error=self.last_cursor_error)
    def arm(self):
        with self.lock:
            if not self.mouse.available:return False,'System cursor control requires Windows'
            if self.mouse.escape_down():return False,'Release Escape before enabling'
            self.armed=True;self.paused=False;self.reason='Active'
            if hasattr(self.mouse,'reset_residual'):self.mouse.reset_residual()
            self.last_heartbeat=time.monotonic()
            return True,'Active'
    def pause(self,reason='Paused by user'):
        with self.lock:
            self.paused=True;self.reason=reason
            if hasattr(self.mouse,'reset_residual'):self.mouse.reset_residual()
    def disarm(self):
        with self.lock:self.armed=False;self.paused=True;self.reason='Disarmed'
    def command(self,data):
        with self.lock:
            if self.mouse.escape_down():
                self.paused=True;self.reason='Emergency pause: Escape key'
            if not self.armed or self.paused:return False,'Controller paused'
            kind=data.get('type')
            if kind=='heartbeat':pass
            elif kind=='move':
                x,y=data.get('x'),data.get('y')
                if not all(isinstance(v,(int,float)) and math.isfinite(v) and 0<=v<=1 for v in (x,y)):
                    return False,'Invalid pointer coordinates'
                self.mouse.move(x,y)
            elif kind=='move_relative':
                dx,dy=data.get('dx'),data.get('dy')
                if not all(isinstance(v,(int,float)) and not isinstance(v,bool) and math.isfinite(v) and abs(v)<=.075 for v in (dx,dy)):
                    return False,'Invalid relative pointer displacement'
                self.mouse.move_relative(dx,dy)
            elif kind=='test_cursor':
                before=self.mouse.position();w,h=self.mouse.size()
                direction=1 if before[0]<.78 else -1
                self.mouse.move_relative(direction*min(80/w,.05),0)
                after=self.mouse.position()
                if abs(after[0]-before[0])*w<15:
                    return False,'Windows cursor did not move. Verify Windows bridge and permissions.'
            elif kind=='click':self.mouse.click()
            elif kind=='scroll':
                ticks=data.get('ticks')
                if not isinstance(ticks,int) or not -3<=ticks<=3:return False,'Invalid scroll ticks'
                self.mouse.scroll(ticks)
            elif kind=='zoom':
                direction,steps=data.get('direction'),data.get('steps')
                if direction not in (-1,1) or steps not in (1,2):return False,'Invalid zoom command'
                self.mouse.zoom(direction,steps)
            else:return False,'Unknown command'
            self.last_heartbeat=time.monotonic()
            if kind!='heartbeat':self.command_count+=1
            return True,'OK'
    def diagnostic_cursor(self):
        """One explicitly requested 80px movement, independent of the webcam.

        It deliberately does NOT arm gesture control. Escape blocks the test.
        """
        with self.lock:
            if not self.mouse.available:
                return False,'Windows desktop input unavailable',0
            if self.mouse.escape_down():
                return False,'Release Escape before running the test',0
            try:
                before=self.mouse.position()
                w,h=self.mouse.size()
                distance=min(80,max(20,w//8))
                direction=1 if before[0]<.78 else -1
                self.mouse.move_relative(direction*distance/max(1,w-1),0)
                time.sleep(.045)
                after=self.mouse.position()
                observed=round((after[0]-before[0])*max(1,w-1))
                if abs(observed)<15:
                    reason=f'Windows did not move the pointer (observed {observed}px). Check desktop session or pointer permissions.'
                    self.last_cursor_error=reason
                    return False,reason,observed
                self.last_cursor_error=''
                return True,f'Windows cursor moved {observed}px',observed
            except (OSError,RuntimeError) as error:
                self.last_cursor_error=f'{type(error).__name__}: {error}'
                return False,self.last_cursor_error,0

    def watchdog_tick(self,now=None):
        now=time.monotonic() if now is None else now
        with self.lock:
            if self.armed and not self.paused and now-self.last_heartbeat>1.0:
                self.paused=True;self.reason='Safety stop: connection or tracking timed out'

CONTROL=Controller()

class Handler(BaseHTTPRequestHandler):
    def log_message(self,fmt,*args):
        if self.path.startswith('/api/input'):return
        print('%s %s'%(self.address_string(),fmt%args))
    def respond(self,status,obj):
        payload=json.dumps(obj).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type','application/json; charset=utf-8')
        self.send_header('Content-Length',str(len(payload)))
        self.send_header('Cache-Control','no-store')
        self.send_header('X-Content-Type-Options','nosniff')
        self.end_headers();self.wfile.write(payload)
    def do_GET(self):
        path=urlsplit(self.path).path
        if path=='/api/status':
            self.respond(200,{**CONTROL.status(), 'token':TOKEN});return
        paths={'/':'index.html','/index.html':'index.html','/app.js':'app.js','/gestures.js':'gestures.js'}
        name=paths.get(path)
        if name is None:self.send_error(404);return
        mime='text/javascript' if name.endswith('.js') else 'text/html'
        try:data=(ROOT/name).read_bytes()
        except OSError:self.send_error(404);return
        self.send_response(200)
        self.send_header('Content-Type',mime+'; charset=utf-8')
        self.send_header('Content-Length',str(len(data)))
        self.send_header('Cache-Control','no-store')
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Content-Security-Policy', "default-src 'self' https://cdn.jsdelivr.net https://storage.googleapis.com; script-src 'self' https://cdn.jsdelivr.net 'wasm-unsafe-eval'; worker-src 'self' blob:; connect-src 'self' https://cdn.jsdelivr.net https://storage.googleapis.com; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; media-src 'self' blob:; object-src 'none'; frame-ancestors 'none'")
        self.end_headers();self.wfile.write(data)
    def do_POST(self):
        path=urlsplit(self.path).path
        origin=self.headers.get('Origin')
        if origin and origin != f'http://{HOST}:{PORT}':self.respond(403,{'error':'Cross-origin request blocked'});return
        if self.headers.get('Content-Type','').split(';')[0].strip()!='application/json':
            self.respond(415,{'error':'JSON required'});return
        if not secrets.compare_digest(self.headers.get('X-Kinex-Token',''),TOKEN):
            self.respond(403,{'error':'Session authorization failed'});return
        length=int(self.headers.get('Content-Length','0'))
        if not 0<length<=2048:self.respond(413,{'error':'Invalid payload size'});return
        try:data=json.loads(self.rfile.read(length))
        except (ValueError,UnicodeDecodeError):self.respond(400,{'error':'Invalid JSON'});return
        if not isinstance(data,dict):self.respond(400,{'error':'Expected JSON object'});return
        if path=='/api/arm':ok,reason=CONTROL.arm()
        elif path=='/api/pause':CONTROL.pause();ok,reason=True,'Paused'
        elif path=='/api/disarm':CONTROL.disarm();ok,reason=True,'Disarmed'
        elif path=='/api/input':
            try: ok,reason=CONTROL.command(data)
            except (OSError,RuntimeError) as error:
                ok,reason=False,f'Windows cursor API error: {error}'
                CONTROL.last_cursor_error=reason
        elif path=='/api/cursor-test':
            ok,reason,observed=CONTROL.diagnostic_cursor()
            self.respond(200 if ok else 409,{**CONTROL.status(),'ok':ok,'message':reason,'observed_dx_px':observed})
            return
        else:self.respond(404,{'error':'Unknown endpoint'});return
        self.respond(200 if ok else 409,{**CONTROL.status(),'ok':ok,'message':reason})

def monitor():
    was_down=False
    while True:
        is_down=CONTROL.mouse.escape_down()
        if is_down and not was_down:CONTROL.pause('Emergency pause: Escape key')
        was_down=is_down
        CONTROL.watchdog_tick()
        time.sleep(.035)

def desktop_browser_candidates():
    """Windows Chrome and Edge paths; ordinary browser profile is unaffected."""
    roots=[os.environ.get('PROGRAMFILES',''),os.environ.get('PROGRAMFILES(X86)',''),
           os.environ.get('LOCALAPPDATA','')]
    relpaths=[('Google','Chrome','Application','chrome.exe'),
              ('Microsoft','Edge','Application','msedge.exe')]
    for rel in relpaths:
        for root in roots:
            if root:
                yield Path(root).joinpath(*rel)
    for executable in ('chrome.exe','msedge.exe'):
        resolved=shutil.which(executable)
        if resolved:
            yield Path(resolved)


def desktop_browser_command(executable,profile,url):
    """An isolated app window; background-throttling flags apply only here."""
    return [str(executable),f'--user-data-dir={profile}','--no-first-run',
            '--no-default-browser-check',f'--app={url}',
            '--disable-background-timer-throttling',
            '--disable-renderer-backgrounding',
            '--disable-backgrounding-occluded-windows',
            '--disable-features=CalculateNativeWinOcclusion']


def launch_desktop():
    """Prefer a dedicated Chromium app window over a throttled normal tab."""
    url=f'http://{HOST}:{PORT}/'
    if sys.platform=='win32':
        for browser in desktop_browser_candidates():
            if not browser.is_file():
                continue
            profile=Path(os.environ.get('LOCALAPPDATA') or str(ROOT))/'KINEX-AIR'/'BrowserProfile'
            try:
                profile.mkdir(parents=True,exist_ok=True)
                subprocess.Popen(desktop_browser_command(browser,profile,url),
                                 stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
                print('Started dedicated KINEX AIR window:',browser.name)
                print('Leave this window RUNNING while using other apps. Closing it pauses control.')
                print('Background processing is best-effort and depends on Windows/browser conditions.')
                return True
            except OSError as error:
                print('Could not start',browser,':',error)
    print('Dedicated Chrome/Edge window not available. Opening normal browser; inactive tabs may pause tracking.')
    webbrowser.open(url)
    return False


def main():
    threading.Thread(target=monitor,daemon=True).start()
    server=ThreadingHTTPServer((HOST,PORT),Handler)
    print(f'KINEX AIR available at http://{HOST}:{PORT}')
    print('OS control starts PAUSED. Press Escape at any time to pause globally.')
    print('Only numeric cursor commands go to the local bridge. Camera video remains in the browser.')
    launch_desktop()
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:CONTROL.disarm();server.server_close()

if __name__=='__main__':main()
