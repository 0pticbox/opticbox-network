0PTIC'S AUDIO BRIDGE — WINDOWS BETA
===================================

WHAT IT DOES
0PTIC'S AUDIO BRIDGE reads the level of the audio that Windows is sending to
its DEFAULT speaker/headphone output. The Firefox versions of 0PTICSCOPE,
0PS3, and SPECTRAVAULT connect to the bridge automatically on localhost.

WHY IT EXISTS
Firefox may not expose computer/system audio to a normal web page during
screen sharing. The bridge works outside Firefox and reads Windows output
instead, then sends safe visualizer meter data to the local Firefox page.

START
1. Double-click: START 0PTICS AUDIO BRIDGE.cmd
2. Leave the bridge window open.
3. Open the FIREFOX version of an OPTICBOX audio visualizer.
4. The app should change from LOOKING FOR BRIDGE to BRIDGE CONNECTED.
5. Play audio through the Windows default speakers/headphones.

STOP
Return to the bridge window and press ENTER.

NOTES
- Windows only for this beta.
- No administrator access is requested.
- No audio is uploaded anywhere. The local status server only listens on
  127.0.0.1 (your own computer).
- This first bridge version sends output level + derived bass/mid/treble
  motion data. It does not send the raw system audio waveform to the website.
- If you change the Windows default output device while it is running,
  restart the bridge.
