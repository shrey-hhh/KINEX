"""KINEX AIR: direct Windows pointer diagnostic, without webcam or browser.

Run this once with Python 3 to isolate OS cursor permissions from MediaPipe.
Moves the REAL Windows mouse pointer 80 pixels and restores it after one second.
No third-party modules or Arduino hardware needed.
"""
import ctypes
import sys
import time
from ctypes import wintypes

if sys.platform != "win32":
    raise SystemExit("This diagnostic requires Windows.")

user32 = ctypes.WinDLL("user32", use_last_error=True)
user32.GetCursorPos.argtypes = [ctypes.POINTER(wintypes.POINT)]
user32.GetCursorPos.restype = wintypes.BOOL
user32.SetCursorPos.argtypes = [ctypes.c_int, ctypes.c_int]
user32.SetCursorPos.restype = wintypes.BOOL
user32.GetSystemMetrics.argtypes = [ctypes.c_int]
user32.GetSystemMetrics.restype = ctypes.c_int

def read():
    point = wintypes.POINT()
    if not user32.GetCursorPos(ctypes.byref(point)):
        raise OSError(ctypes.get_last_error(), "GetCursorPos failed")
    return point.x, point.y

def move(x, y):
    if not user32.SetCursorPos(int(x), int(y)):
        raise OSError(ctypes.get_last_error(), "SetCursorPos failed")

def main():
    x, y = read()
    width = user32.GetSystemMetrics(0)
    amount = 80 if x + 80 < width else -80
    print("KINEX AIR — REAL WINDOWS CURSOR TEST")
    print("Starting position:", (x, y))
    print("Attempting movement:", amount, "pixels")
    try:
        move(x + amount, y)
        time.sleep(0.3)
        current = read()
        observed = current[0] - x
        print("Observed position:", current)
        print("Observed horizontal movement:", observed, "pixels")
        if abs(observed) >= 15:
            print("PASS: native Windows cursor movement is working.")
        else:
            print("FAIL: Windows cursor did not move as requested.")
            print("Check pointer restrictions, remote sessions or another program controlling the mouse.")
    finally:
        time.sleep(0.7)
        try:
            move(x, y)
            print("Original cursor position restored.")
        except OSError as error:
            print("Could not restore original cursor:", error)
    input("Press Enter to close...")

if __name__ == "__main__":
    main()
