// The Stupid Browser: the installer people download. A small, calm window in the browser's own look (no Windows
// wizard): it runs the real installer (StupidBrowser-Setup.exe, embedded) silently, shows progress, then opens the
// browser. Built on GitHub's Windows machine with the C# compiler that ships with Windows (.github/workflows), so it
// is plain C# 5 / WinForms: no frameworks to install. Updates don't use this: installed browsers update themselves.
using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Text;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

[assembly: AssemblyTitle("The Stupid Browser")]
[assembly: AssemblyProduct("The Stupid Browser")]
[assembly: AssemblyDescription("Installs The Stupid Browser")]

static class Program {
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  [STAThread]
  static void Main(string[] args) {
    try { SetProcessDPIAware(); } catch { }
    Application.EnableVisualStyles();
    Application.SetCompatibleTextRenderingDefault(false);
    bool test = Array.IndexOf(args, "--test") >= 0;   // CI: install, don't open the browser, exit with a code
    var f = new InstallForm(test);
    Application.Run(f);
    Environment.ExitCode = f.Result;
  }
}

class InstallForm : Form {
  // The browser's colours (styles.css): warm cream, ink text, clay accent.
  static readonly Color Bg = Color.FromArgb(250, 246, 240);
  static readonly Color Ink = Color.FromArgb(41, 37, 30);
  static readonly Color Muted = Color.FromArgb(138, 130, 118);
  static readonly Color Line = Color.FromArgb(232, 224, 212);
  static readonly Color Clay = Color.FromArgb(217, 119, 87);
  static readonly Color ClayLight = Color.FromArgb(242, 181, 154);
  static readonly Color Sage = Color.FromArgb(63, 185, 138);

  readonly bool test;
  public int Result = 1;
  float scale = 1f;
  string status = "Getting things ready…";
  string title = "Installing The Stupid Browser";
  double target = 0, shown = 0;
  bool done = false, failed = false;
  DateTime started = DateTime.Now, phaseStart = DateTime.Now;
  int phase = 0;   // 0 unpacking, 1 installing, 2 opening
  readonly System.Windows.Forms.Timer tick = new System.Windows.Forms.Timer();
  Rectangle closeBtn, retryBtn;
  Point dragFrom; bool dragging;

  public InstallForm(bool test) {
    this.test = test;
    using (var g = CreateGraphics()) scale = g.DpiX / 96f;
    FormBorderStyle = FormBorderStyle.None;
    StartPosition = FormStartPosition.Manual;
    ClientSize = new Size(S(440), S(280));
    BackColor = Bg;
    DoubleBuffered = true;
    ShowInTaskbar = true;
    Text = "The Stupid Browser";
    try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { }
    Opacity = 0;
    Region = new Region(Rounded(new Rectangle(0, 0, ClientSize.Width, ClientSize.Height), S(18)));
    tick.Interval = 16;
    tick.Tick += OnTick;
    MouseDown += (s, e) => { if (e.Button == MouseButtons.Left && !Hit(e.Location)) { dragging = true; dragFrom = e.Location; } };
    MouseMove += (s, e) => { if (dragging) Location = new Point(Location.X + e.X - dragFrom.X, Location.Y + e.Y - dragFrom.Y); Cursor = Hit(e.Location) ? Cursors.Hand : Cursors.Default; };
    MouseUp += (s, e) => { dragging = false; };
    MouseClick += OnClick;
    // Centred on the screen the pointer is on (Windows' own centring is off when the scale isn't 100%).
    Load += (s, e) => { var wa = Screen.FromPoint(Cursor.Position).WorkingArea; Location = new Point(wa.X + (wa.Width - Width) / 2, wa.Y + (wa.Height - Height) / 2); };
    Shown += (s, e) => { tick.Start(); Start(); };
  }

  int S(float v) { return (int)Math.Round(v * scale); }
  bool waitingForClose = false;   // the browser is open: asked to close it first
  bool Hit(Point p) { return (failed || waitingForClose) && (closeBtn.Contains(p) || retryBtn.Contains(p)); }

  void OnClick(object s, MouseEventArgs e) {
    if (waitingForClose) {
      // "Close it for me": asks the browser to close the normal way (it saves your tabs), like clicking its ×.
      if (retryBtn.Contains(e.Location)) { closeAsked = true; CloseBrowser(); status = "Closing it…"; Invalidate(); }
      else if (closeBtn.Contains(e.Location)) { cancelled = true; Result = 1; Close(); }
      return;
    }
    if (!failed) return;
    if (closeBtn.Contains(e.Location)) { Result = 1; Close(); }
    else if (retryBtn.Contains(e.Location)) { failed = false; done = false; target = 0; shown = 0; phase = 0; Start(); }
  }

  void Start() {
    title = "Installing The Stupid Browser";
    status = "Getting things ready…";
    started = DateTime.Now; phaseStart = DateTime.Now;
    new Thread(Work) { IsBackground = true }.Start();
  }

  // From the worker thread: does nothing once the window is gone (closed while it worked).
  void Ui(Action a) { try { if (IsHandleCreated && !IsDisposed) BeginInvoke(a); } catch (InvalidOperationException) { } catch (ObjectDisposedException) { } }
  void Set(string st, int ph) { Ui(() => { status = st; if (ph != phase) { phase = ph; phaseStart = DateTime.Now; } Invalidate(); }); }
  volatile bool cancelled = false;
  volatile string setupPath = null;
  protected override void OnFormClosed(FormClosedEventArgs e) { base.OnFormClosed(e); try { var f = setupPath; if (f != null && File.Exists(f)) File.Delete(f); } catch { } }
  // Only this Windows user's copy counts (another signed-in user's browser can't be closed from here, and doesn't block).
  static Process[] Mine() { int me = Process.GetCurrentProcess().SessionId; var list = new System.Collections.Generic.List<Process>(); foreach (var p in Process.GetProcessesByName("StupidBrowser")) { try { if (p.SessionId == me) list.Add(p); else p.Dispose(); } catch { p.Dispose(); } } return list.ToArray(); }
  static bool BrowserOpen() { var ps = Mine(); foreach (var p in ps) p.Dispose(); return ps.Length > 0; }
  volatile bool closeAsked = false;
  static void CloseBrowser() { foreach (var p in Mine()) { try { p.CloseMainWindow(); } catch { } p.Dispose(); } }

  void Work() {
    string setup = setupPath = Path.Combine(Path.GetTempPath(), "StupidBrowser-Setup-" + Guid.NewGuid().ToString("N").Substring(0, 8) + ".exe");
    try {
      // 1. The browser can't be replaced while it's open, and closing it for you without asking could lose something:
      // ask, and carry on by itself the moment it's closed.
      if (BrowserOpen()) {
        Ui(() => { waitingForClose = true; title = "Close The Stupid Browser first"; status = "It's open right now. Close it and this carries on by itself; your tabs come back."; Invalidate(); });
        while (BrowserOpen()) { if (cancelled) return; if (closeAsked) CloseBrowser(); Thread.Sleep(700); }   // every window, one by one
        Ui(() => { waitingForClose = false; title = "Installing The Stupid Browser"; Invalidate(); });
      }
      // 2. Unpack the real installer (embedded in this file).
      using (var src = Assembly.GetExecutingAssembly().GetManifestResourceStream("setup.exe")) {
        if (src == null) throw new Exception("The installer is incomplete. Download it again.");
        using (var dst = File.Create(setup)) {
          var buf = new byte[1 << 20]; long total = src.Length, done_ = 0; int n;
          while ((n = src.Read(buf, 0, buf.Length)) > 0) { dst.Write(buf, 0, n); done_ += n; double p = 0.12 * done_ / Math.Max(1, total); Ui(() => { target = p; }); }
        }
      }
      // 3. Run the real installer silently.
      Set("Putting everything in place…", 1);
      var psi = new ProcessStartInfo(setup, "/S") { UseShellExecute = false, CreateNoWindow = true };
      using (var p = Process.Start(psi)) {
        p.WaitForExit();
        if (p.ExitCode != 0) throw new Exception("Windows stopped the install (code " + p.ExitCode + "). Try again.");
      }
      try { File.Delete(setup); } catch { }   // now, before the window closes (the app ends with it)
      string exe = FindBrowser();
      if (exe == null) throw new Exception("The browser wasn't found after installing. Try again.");
      // 4. Open it.
      Ui(() => { target = 1; title = "All set"; status = test ? "Installed." : "Opening The Stupid Browser…"; phase = 2; phaseStart = DateTime.Now; done = true; Result = 0; Invalidate(); });
      if (!test) { try { Process.Start(new ProcessStartInfo(exe) { UseShellExecute = true, WorkingDirectory = Path.GetDirectoryName(exe) }); } catch { } }
      Thread.Sleep(test ? 2500 : 1400);
      Ui(() => { fadingOut = true; });
    } catch (Exception ex) {
      string msg = ex.Message;
      if (test) { try { File.WriteAllText(Path.Combine(Path.GetTempPath(), "stupid-install-error.txt"), msg); } catch { } Ui(() => { Result = 1; failed = true; allowClose = true; Close(); }); return; }
      Ui(() => { failed = true; title = "That didn't work"; status = msg; Invalidate(); });
    } finally {
      try { if (File.Exists(setup)) File.Delete(setup); } catch { }
    }
  }

  // Where it was installed: the uninstall entry Windows keeps (a folder chosen in an older version is respected),
  // else the usual place.
  static string FindBrowser() {
    try {
      using (var root = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall")) {
        if (root != null) foreach (var name in root.GetSubKeyNames()) {
          using (var k = root.OpenSubKey(name)) {
            if (k == null) continue;
            var dn = k.GetValue("DisplayName") as string;
            if (dn == null || !dn.StartsWith("The Stupid Browser")) continue;
            var icon = (k.GetValue("DisplayIcon") as string ?? "").Trim();
            int comma = icon.LastIndexOf(','); if (comma > 0) icon = icon.Substring(0, comma);
            icon = icon.Trim('"');
            if (icon.EndsWith(".exe", StringComparison.OrdinalIgnoreCase) && File.Exists(icon)) return icon;
            // The uninstaller sits in the install folder ("…\Uninstall The Stupid Browser.exe" /currentuser).
            var un = (k.GetValue("UninstallString") as string ?? "").Trim();
            if (un.StartsWith("\"")) { int q = un.IndexOf('"', 1); if (q > 1) un = un.Substring(1, q - 1); }
            try { var dir = Path.GetDirectoryName(un); if (!string.IsNullOrEmpty(dir) && File.Exists(Path.Combine(dir, "StupidBrowser.exe"))) return Path.Combine(dir, "StupidBrowser.exe"); } catch { }
            var loc = k.GetValue("InstallLocation") as string;
            if (loc != null && File.Exists(Path.Combine(loc, "StupidBrowser.exe"))) return Path.Combine(loc, "StupidBrowser.exe");
          }
        }
      }
    } catch { }
    var def = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Programs\the-stupid-browser\StupidBrowser.exe");
    return File.Exists(def) ? def : null;
  }

  bool fadingOut = false;
  void OnTick(object s, EventArgs e) {
    if (fadingOut) { Opacity = Math.Max(0, Opacity - 0.08); if (Opacity <= 0) Close(); return; }
    if (Opacity < 1) Opacity = Math.Min(1, Opacity + 0.08);
    // While the real installer works it can't tell us how far it is, so the bar glides toward the end and slows as
    // it nears it; it jumps to full the moment it's really done.
    if (phase == 1 && !failed) { double t = (DateTime.Now - phaseStart).TotalSeconds; target = Math.Max(target, 0.12 + 0.83 * (1 - Math.Exp(-t / 7.0))); }
    shown += (target - shown) * 0.12;
    Invalidate();
  }

  static GraphicsPath Rounded(Rectangle r, int rad) {
    var p = new GraphicsPath(); int d = rad * 2;
    p.AddArc(r.X, r.Y, d, d, 180, 90); p.AddArc(r.Right - d, r.Y, d, d, 270, 90);
    p.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90); p.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
    p.CloseFigure(); return p;
  }

  protected override void OnPaint(PaintEventArgs e) {
    var g = e.Graphics;
    g.SmoothingMode = SmoothingMode.AntiAlias;
    g.TextRenderingHint = TextRenderingHint.ClearTypeGridFit;
    int w = ClientSize.Width, h = ClientSize.Height;
    using (var pen = new Pen(Line, Math.Max(1, S(1)))) using (var path = Rounded(new Rectangle(0, 0, w - 1, h - 1), S(18))) g.DrawPath(pen, path);

    // The orb with eyes (Buddy), breathing gently; green once it's done.
    double t = (DateTime.Now - started).TotalSeconds;
    float breathe = (float)(1 + 0.04 * Math.Sin(t * 2.4));
    float r = S(30) * breathe; float cx = w / 2f, cy = S(78);
    Color c1 = failed ? Color.FromArgb(214, 160, 150) : done ? Color.FromArgb(191, 229, 207) : ClayLight;
    Color c2 = failed ? Color.FromArgb(190, 100, 90) : done ? Sage : Clay;
    using (var glow = new SolidBrush(Color.FromArgb(28, c2))) g.FillEllipse(glow, cx - r - S(9), cy - r - S(9), (r + S(9)) * 2, (r + S(9)) * 2);
    using (var orbPath = new GraphicsPath()) {
      orbPath.AddEllipse(cx - r, cy - r, r * 2, r * 2);
      using (var br = new PathGradientBrush(orbPath)) {
        br.CenterPoint = new PointF(cx - r * 0.3f, cy - r * 0.4f);
        br.CenterColor = c1; br.SurroundColors = new[] { c2 };
        g.FillPath(br, orbPath);
      }
    }
    // Eyes, with a blink every few seconds.
    bool blink = (t % 4.2) > 4.05;
    float ew = r * 0.26f, eh = blink ? r * 0.08f : r * 0.6f, ey = cy - r * 0.38f + (blink ? r * 0.26f : 0);
    using (var white = new SolidBrush(Color.White)) {
      using (var p1 = Rounded(new Rectangle((int)(cx - r * 0.42f), (int)ey, (int)ew, Math.Max(2, (int)eh)), Math.Max(1, (int)(ew / 2)))) g.FillPath(white, p1);
      using (var p2 = Rounded(new Rectangle((int)(cx + r * 0.16f), (int)ey, (int)ew, Math.Max(2, (int)eh)), Math.Max(1, (int)(ew / 2)))) g.FillPath(white, p2);
    }

    // Title and status.
    var center = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Near, Trimming = StringTrimming.EllipsisCharacter };
    using (var ft = new Font("Segoe UI Semibold", 14.5f)) using (var b = new SolidBrush(Ink))
      g.DrawString(title, ft, b, new RectangleF(S(24), S(128), w - S(48), S(32)), center);
    using (var fs = new Font("Segoe UI", 9.75f)) using (var b = new SolidBrush(Muted))
      g.DrawString(status, fs, b, new RectangleF(S(30), S(162), w - S(60), S(40)), center);

    if (!failed && !waitingForClose) {
      // Progress: a thin rounded track and fill.
      int bw = S(220), bh = S(5), bx = (w - bw) / 2, by = S(214);
      using (var track = Rounded(new Rectangle(bx, by, bw, bh), bh / 2)) using (var tb = new SolidBrush(Line)) g.FillPath(tb, track);
      int fw = Math.Max(bh, (int)(bw * Math.Min(1, shown)));
      using (var fill = Rounded(new Rectangle(bx, by, fw, bh), bh / 2)) using (var fb = new SolidBrush(done ? Sage : Clay)) g.FillPath(fb, fill);
      closeBtn = Rectangle.Empty; retryBtn = Rectangle.Empty;
    } else {
      // Two quiet buttons: Try again (filled) and Close.
      int bh = S(34), gap = S(10), w1 = S(waitingForClose ? 140 : 110), w2 = S(90), y = S(212), x = (w - (w1 + w2 + gap)) / 2;
      retryBtn = new Rectangle(x, y, w1, bh); closeBtn = new Rectangle(x + w1 + gap, y, w2, bh);
      using (var f = new Font("Segoe UI Semibold", 9.75f)) {
        using (var p = Rounded(retryBtn, bh / 2)) using (var b = new SolidBrush(Clay)) g.FillPath(b, p);
        using (var p = Rounded(closeBtn, bh / 2)) using (var pen = new Pen(Line, S(1))) g.DrawPath(pen, p);
        var mid = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };
        using (var b = new SolidBrush(Color.White)) g.DrawString(waitingForClose ? "Close it for me" : "Try again", f, b, retryBtn, mid);
        using (var b = new SolidBrush(Ink)) g.DrawString(waitingForClose ? "Cancel" : "Close", f, b, closeBtn, mid);
      }
    }
    using (var ff = new Font("Segoe UI", 8f)) using (var b = new SolidBrush(Color.FromArgb(150, Muted)))
      g.DrawString("Your tabs, passwords and settings stay as they are.", ff, b, new RectangleF(S(20), h - S(34), w - S(40), S(20)), center);
  }

  // Esc closes only if it failed (an install isn't stopped halfway).
  // Not closed halfway through an install (Alt+F4, the taskbar): only before it starts copying, when it failed, or done.
  bool allowClose = false;
  protected override void OnFormClosing(FormClosingEventArgs e) {
    bool busy = !failed && !done && !waitingForClose && !allowClose && !fadingOut;
    if (busy && e.CloseReason == CloseReason.UserClosing) { e.Cancel = true; return; }
    if (waitingForClose) cancelled = true;
    base.OnFormClosing(e);
  }
  protected override bool ProcessCmdKey(ref Message msg, Keys keyData) {
    if (keyData == Keys.Escape && failed) { Close(); return true; }
    return base.ProcessCmdKey(ref msg, keyData);
  }
  protected override CreateParams CreateParams { get { var cp = base.CreateParams; cp.ClassStyle |= 0x20000; return cp; } }   // a soft drop shadow
}
