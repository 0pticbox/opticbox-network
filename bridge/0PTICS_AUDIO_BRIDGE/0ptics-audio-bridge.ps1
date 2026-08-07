$ErrorActionPreference = 'Stop'
$host.UI.RawUI.WindowTitle = "0PTIC'S AUDIO BRIDGE"

$source = @'
using System;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

namespace OpticsAudioBridge {
    [ComImport]
    [Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
    internal class MMDeviceEnumeratorComObject { }

    internal enum EDataFlow { eRender = 0, eCapture = 1, eAll = 2 }
    internal enum ERole { eConsole = 0, eMultimedia = 1, eCommunications = 2 }

    [ComImport]
    [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IMMDeviceEnumerator {
        int EnumAudioEndpoints(EDataFlow dataFlow, uint dwStateMask, out IntPtr devices);
        int GetDefaultAudioEndpoint(EDataFlow dataFlow, ERole role, out IMMDevice endpoint);
        int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string pwstrId, out IMMDevice device);
        int RegisterEndpointNotificationCallback(IntPtr client);
        int UnregisterEndpointNotificationCallback(IntPtr client);
    }

    [ComImport]
    [Guid("D666063F-1587-4E43-81F1-B948E807363F")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IMMDevice {
        int Activate(ref Guid iid, uint clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object interfacePointer);
        int OpenPropertyStore(uint stgmAccess, out IntPtr properties);
        int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
        int GetState(out uint state);
    }

    [ComImport]
    [Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IAudioMeterInformation {
        int GetPeakValue(out float peak);
        int GetMeteringChannelCount(out int channelCount);
        int GetChannelsPeakValues(int channelCount, [Out, MarshalAs(UnmanagedType.LPArray, SizeParamIndex = 0)] float[] peakValues);
        int QueryHardwareSupport(out int hardwareSupportMask);
    }

    public static class BridgeServer {
        private const int Port = 17491;
        private const uint CLSCTX_ALL = 23;
        private static readonly object Gate = new object();
        private static volatile bool running;
        private static TcpListener listener;
        private static Thread serverThread;
        private static IMMDevice device;
        private static IAudioMeterInformation meter;
        private static float level, bass, mids, treble, left, right;
        private static string sourceName = "WINDOWS DEFAULT OUTPUT";
        private static string lastError = "";
        private static DateTime startedAt;

        public static void Start() {
            if (running) return;
            startedAt = DateTime.UtcNow;
            running = true;
            listener = new TcpListener(IPAddress.Loopback, Port);
            listener.Start();
            serverThread = new Thread(ServerLoop) { IsBackground = true, Name = "OpticsBridgeHTTP" };
            serverThread.SetApartmentState(ApartmentState.MTA);
            serverThread.Start();
        }

        public static void Stop() {
            running = false;
            try { if (listener != null) listener.Stop(); } catch { }
            try { if (meter != null && Marshal.IsComObject(meter)) Marshal.ReleaseComObject(meter); } catch { }
            try { if (device != null && Marshal.IsComObject(device)) Marshal.ReleaseComObject(device); } catch { }
            meter = null;
            device = null;
        }

        private static void InitializeMeter() {
            try {
                var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
                IMMDevice dev;
                int hr = enumerator.GetDefaultAudioEndpoint(EDataFlow.eRender, ERole.eMultimedia, out dev);
                Marshal.ThrowExceptionForHR(hr);
                object obj;
                Guid iid = typeof(IAudioMeterInformation).GUID;
                hr = dev.Activate(ref iid, CLSCTX_ALL, IntPtr.Zero, out obj);
                Marshal.ThrowExceptionForHR(hr);
                meter = (IAudioMeterInformation)obj;
                device = dev;
                try {
                    string id;
                    if (dev.GetId(out id) == 0 && !String.IsNullOrWhiteSpace(id)) sourceName = "WINDOWS DEFAULT OUTPUT";
                } catch { }
                try { if (Marshal.IsComObject(enumerator)) Marshal.ReleaseComObject(enumerator); } catch { }
                lastError = "";
            } catch (Exception ex) {
                meter = null;
                lastError = ex.Message;
            }
        }

        private static float Clamp(float v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }

        private static void Sample(object state) {
            try {
                if (meter == null) {
                    InitializeMeter();
                    if (meter == null) return;
                }
                float peak;
                int hr = meter.GetPeakValue(out peak);
                if (hr != 0) Marshal.ThrowExceptionForHR(hr);

                int count = 0;
                float l = peak, r = peak;
                try {
                    if (meter.GetMeteringChannelCount(out count) == 0 && count > 0) {
                        var channels = new float[count];
                        if (meter.GetChannelsPeakValues(count, channels) == 0) {
                            l = channels[0];
                            r = count > 1 ? channels[1] : channels[0];
                        }
                    }
                } catch { }

                lock (Gate) {
                    // Envelope followers at three speeds. These are intentionally derived
                    // from the real Windows output meter so visual motion has bass/mid/high
                    // personalities without asking Firefox to capture protected system audio.
                    level += (peak - level) * 0.52f;
                    bass += (peak - bass) * 0.055f;
                    mids += (peak - mids) * 0.18f;
                    float transient = Math.Max(0f, peak - mids);
                    treble += ((transient * 3.8f + Math.Max(0f, level - bass) * 1.35f) - treble) * 0.34f;
                    left += (l - left) * 0.45f;
                    right += (r - right) * 0.45f;
                    level = Clamp(level);
                    bass = Clamp(bass * 1.01f);
                    mids = Clamp(mids);
                    treble = Clamp(treble);
                    left = Clamp(left);
                    right = Clamp(right);
                }
                lastError = "";
            } catch (Exception ex) {
                lastError = ex.Message;
                try { if (meter != null && Marshal.IsComObject(meter)) Marshal.ReleaseComObject(meter); } catch { }
                meter = null;
            }
        }

        private static void ServerLoop() {
            InitializeMeter();
            while (running) {
                try {
                    var client = listener.AcceptTcpClient();
                    HandleClient(client);
                } catch {
                    if (!running) return;
                    Thread.Sleep(50);
                }
            }
        }

        private static string Escape(string s) {
            if (s == null) return "";
            return s.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", " ").Replace("\n", " ");
        }

        private static string StatusJson() {
            float lv, ba, mi, tr, le, ri;
            lock (Gate) { lv = level; ba = bass; mi = mids; tr = treble; le = left; ri = right; }
            bool ok = meter != null && String.IsNullOrEmpty(lastError);
            long uptime = (long)(DateTime.UtcNow - startedAt).TotalMilliseconds;
            return String.Format(System.Globalization.CultureInfo.InvariantCulture,
                "{{\"name\":\"0PTIC'S AUDIO BRIDGE\",\"connected\":{0},\"source\":\"{1}\",\"level\":{2:0.0000},\"bass\":{3:0.0000},\"mid\":{4:0.0000},\"treble\":{5:0.0000},\"left\":{6:0.0000},\"right\":{7:0.0000},\"uptime_ms\":{8},\"error\":\"{9}\"}}",
                ok ? "true" : "false", Escape(sourceName), lv, ba, mi, tr, le, ri, uptime, Escape(lastError));
        }

        private static void HandleClient(object obj) {
            using (var client = (TcpClient)obj) {
                client.ReceiveTimeout = 1500;
                client.SendTimeout = 1500;
                using (var stream = client.GetStream())
                using (var reader = new StreamReader(stream, Encoding.ASCII, false, 4096, true)) {
                    string requestLine = reader.ReadLine() ?? "";
                    string line;
                    do { line = reader.ReadLine(); } while (line != null && line.Length > 0);
                    string path = "/";
                    var parts = requestLine.Split(' ');
                    if (parts.Length > 1) path = parts[1];

                    if (requestLine.StartsWith("OPTIONS ")) {
                        WriteResponse(stream, "204 No Content", "text/plain", "");
                        return;
                    }
                    if (path.StartsWith("/status")) {
                        Sample(null);
                        WriteResponse(stream, "200 OK", "application/json; charset=utf-8", StatusJson());
                        return;
                    }
                    string html = "<!doctype html><meta charset='utf-8'><title>0PTIC'S AUDIO BRIDGE</title>" +
                        "<style>body{background:#070707;color:#eee;font:16px Consolas,monospace;padding:32px}b{color:#ff914d}code{color:#9ee7ff}</style>" +
                        "<h1>0PTIC'S AUDIO BRIDGE</h1><p><b>RUNNING</b> — reading the Windows default speaker/headphone output meter.</p>" +
                        "<p>Keep this bridge running. In the OPTICBOX Firefox build, press <b>CONNECT 0PTIC'S AUDIO BRIDGE</b> once and allow Firefox's <b>Device apps &amp; services</b> permission if prompted.</p><p><b>Do not select this bridge window in Screen Audio.</b> The browser connects directly to the bridge over localhost.</p>" +
                        "<p>Bridge endpoint: <code>http://127.0.0.1:17491/status</code></p>";
                    WriteResponse(stream, "200 OK", "text/html; charset=utf-8", html);
                }
            }
        }

        private static void WriteResponse(NetworkStream stream, string status, string contentType, string body) {
            byte[] payload = Encoding.UTF8.GetBytes(body ?? "");
            string headers = "HTTP/1.1 " + status + "\r\n" +
                "Content-Type: " + contentType + "\r\n" +
                "Content-Length: " + payload.Length + "\r\n" +
                "Cache-Control: no-store, no-cache, must-revalidate\r\n" +
                "Access-Control-Allow-Origin: *\r\n" +
                "Access-Control-Allow-Methods: GET, OPTIONS\r\n" +
                "Access-Control-Allow-Headers: Content-Type\r\n" +
                "Access-Control-Allow-Private-Network: true\r\n" +
                "Connection: close\r\n\r\n";
            byte[] hb = Encoding.ASCII.GetBytes(headers);
            stream.Write(hb, 0, hb.Length);
            if (payload.Length > 0) stream.Write(payload, 0, payload.Length);
        }
    }
}
'@

try {
    Add-Type -TypeDefinition $source -Language CSharp
    [OpticsAudioBridge.BridgeServer]::Start()
    Clear-Host
    Write-Host ""
    Write-Host "  0PTIC'S AUDIO BRIDGE" -ForegroundColor Magenta
    Write-Host "  --------------------"
    Write-Host "  STATUS : RUNNING" -ForegroundColor Green
    Write-Host "  SOURCE : WINDOWS DEFAULT SPEAKER / HEADPHONE OUTPUT"
    Write-Host "  PORT   : 127.0.0.1:17491"
    Write-Host ""
    Write-Host "  Keep this window open while using the Firefox versions of"
    Write-Host "  0PTICSCOPE or SPECTRAVAULT."
    Write-Host ""
    Write-Host "  Press ENTER to stop the bridge."
    [void][Console]::ReadLine()
}
catch {
    Write-Host ""
    Write-Host "0PTIC'S AUDIO BRIDGE COULD NOT START" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Press ENTER to close."
    [void][Console]::ReadLine()
}
finally {
    try { [OpticsAudioBridge.BridgeServer]::Stop() } catch { }
}
