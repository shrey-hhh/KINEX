"""No-OS side-effect unit tests for the local command bridge."""
import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from server import Controller

class FakeMouse:
    available=True
    def __init__(self):self.events=[];self.esc=False;self.xy=(.5,.5)
    def size(self):return (1920,1080)
    def position(self):return self.xy
    def reset_residual(self):pass
    def move_relative(self,dx,dy):
        self.events.append(('move_relative',dx,dy))
        self.xy=(min(1,max(0,self.xy[0]+dx)),min(1,max(0,self.xy[1]+dy)))
    def escape_down(self):return self.esc
    def move(self,x,y):self.events.append(('move',x,y))
    def click(self):self.events.append(('click',))
    def scroll(self,ticks):self.events.append(('scroll',ticks))
    def zoom(self,direction,steps):self.events.append(('zoom',direction,steps))

class TestController(unittest.TestCase):
    def setUp(self):self.mouse=FakeMouse();self.control=Controller(self.mouse)
    def test_starts_disarmed(self):
        self.assertFalse(self.control.command({'type':'click'})[0]);self.assertEqual(self.mouse.events,[])
    def test_arm_and_commands(self):
        self.assertTrue(self.control.arm()[0]);self.assertTrue(self.control.command({'type':'move','x':.2,'y':.8})[0]);
        self.assertTrue(self.control.command({'type':'click'})[0]);self.assertEqual(len(self.mouse.events),2)
    def test_invalid_input_rejected(self):
        self.control.arm()
        for d in ({'type':'move','x':-1,'y':2},{'type':'zoom','direction':9,'steps':1},
                  {'type':'scroll','ticks':200},{'type':'anything'}):
            self.assertFalse(self.control.command(d)[0]);self.assertEqual(len(self.mouse.events),0)
    def test_relative_move_validates_signed_finite_small_deltas(self):
        self.control.arm()
        self.assertTrue(self.control.command({'type':'move_relative','dx':.001,'dy':-.002})[0])
        self.assertEqual(self.mouse.events,[('move_relative',.001,-.002)])
        self.mouse.events.clear()
        for d in [
            {'type':'move_relative','dx':.1,'dy':0},
            {'type':'move_relative','dx':float('nan'),'dy':0},
            {'type':'move_relative','dx':True,'dy':0},
            {'type':'move_relative','dx':.01},
        ]:
            self.assertFalse(self.control.command(d)[0]);self.assertEqual(self.mouse.events,[])
    def test_desktop_cursor_test_moves_actual_bridge_position(self):
        self.control.arm()
        before=self.mouse.position()
        ok,reason=self.control.command({'type':'test_cursor'})
        self.assertTrue(ok,reason)
        after=self.mouse.position()
        self.assertGreater((after[0]-before[0])*1920,15)
    def test_explicit_cursor_test_without_arm(self):
        ok,reason,observed=self.control.diagnostic_cursor()
        self.assertTrue(ok,reason)
        self.assertGreaterEqual(abs(observed),15)
        self.assertFalse(self.control.armed)  # one-shot test must not enable gesture mode
    def test_cursor_test_respects_escape(self):
        self.mouse.esc=True
        ok,reason,observed=self.control.diagnostic_cursor()
        self.assertFalse(ok)
        self.assertEqual(self.mouse.events,[])
    def test_desktop_test_is_blocked_when_disarmed(self):
        self.assertFalse(self.control.command({'type':'test_cursor'})[0])
        self.assertEqual(self.mouse.events,[])
    def test_pause_disallows_commands(self):
        self.control.arm();self.control.pause();self.assertFalse(self.control.command({'type':'click'})[0]);
        self.assertEqual(self.mouse.events,[])
    def test_watchdog_pauses(self):
        self.control.arm();self.control.watchdog_tick(self.control.last_heartbeat+1.1)
        self.assertTrue(self.control.paused);self.assertFalse(self.control.command({'type':'click'})[0])
    def test_escape_blocks_arming(self):
        self.mouse.esc=True;self.assertFalse(self.control.arm()[0])

if __name__=='__main__':unittest.main()
