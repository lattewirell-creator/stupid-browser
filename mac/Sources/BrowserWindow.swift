// A browser window: the Electron UI (src/index.html) in a transparent WKWebView on top, the tabs as
// native WKWebViews underneath, placed where the UI's <webview> stand-ins are. Clicks go to a tab when
// they land on it and nothing of the UI covers that spot (menus, popovers, Buddy…).
import Cocoa
import WebKit

/// The UI layer: lets clicks through to the tab below wherever the page shows (no UI covering it).
final class ShellView: WKWebView {
  var passRects: [NSRect] = []    // visible tab areas (in view coordinates, top-left origin)
  var coverRects: [NSRect] = []   // UI on top of them
  override var isFlipped: Bool { true }
  override func hitTest(_ p: NSPoint) -> NSView? {
    let q = convert(p, from: superview)
    if passRects.contains(where: { $0.contains(q) }) && !coverRects.contains(where: { $0.contains(q) }) { return nil }
    return super.hitTest(p)
  }
}

/// The window frame behind the UI: the Electron app's frame colour and clay tint (radial gradient from the
/// top-left corner), optionally over glass.
final class FrameView: NSView {
  private let gradient = CAGradientLayer()
  var glassOn = false { didSet { needsLayout = true } }
  override init(frame: NSRect) {
    super.init(frame: frame)
    wantsLayer = true
    gradient.type = .radial
    layer?.addSublayer(gradient)
  }
  required init?(coder: NSCoder) { fatalError() }
  override func layout() { super.layout(); CATransaction.begin(); CATransaction.setDisableActions(true); gradient.frame = bounds; CATransaction.commit() }
  /// CSS: radial-gradient(120% 90% at 0% 0%, color-mix(accent N%, bar), bar 55%)
  func apply(bar: NSColor, accent: NSColor, modern: Bool, tint: String) {
    let alpha: CGFloat = glassOn ? 0.62 : 1
    let mix: CGFloat = !modern || tint == "none" ? 0 : tint == "strong" ? 0.34 : 0.14
    let start = bar.blended(withFraction: mix, of: accent) ?? bar
    let end = tint == "strong" && modern ? (bar.blended(withFraction: 0.12, of: accent) ?? bar) : bar
    gradient.colors = [start.withAlphaComponent(alpha).cgColor, end.withAlphaComponent(alpha).cgColor]
    gradient.locations = [0, tint == "strong" ? 0.7 : 0.55]
    gradient.startPoint = CGPoint(x: 0, y: 1)      // top-left (layer y goes up)
    gradient.endPoint = CGPoint(x: 1.2, y: 1 - 0.9)
  }
}

func cssColor(_ s: String) -> NSColor? {
  let t = s.trimmingCharacters(in: .whitespaces)
  if t.hasPrefix("#") {
    var hex = String(t.dropFirst()); if hex.count == 3 { hex = hex.map { "\($0)\($0)" }.joined() }
    guard hex.count >= 6, let v = UInt64(hex.prefix(6), radix: 16) else { return nil }
    return NSColor(srgbRed: CGFloat((v >> 16) & 255) / 255, green: CGFloat((v >> 8) & 255) / 255, blue: CGFloat(v & 255) / 255, alpha: 1)
  }
  if t.hasPrefix("rgb") {
    let n = t.components(separatedBy: CharacterSet(charactersIn: "0123456789.").inverted).compactMap(Double.init)
    if n.count >= 3 { return NSColor(srgbRed: n[0] / 255, green: n[1] / 255, blue: n[2] / 255, alpha: 1) }
  }
  return nil
}

/// Window background: Liquid Glass on macOS 26+ (looked up at run time), frosted glass before that.
func makeGlassBackground() -> NSView {
  if let cls = NSClassFromString("NSGlassEffectView") as? NSView.Type {
    let v = cls.init(frame: .zero)
    return v
  }
  let v = NSVisualEffectView()
  v.material = .underWindowBackground
  v.blendingMode = .behindWindow
  v.state = .active
  return v
}

private var nextWindowId = 1

final class BrowserWindow: NSWindowController, NSWindowDelegate, WKScriptMessageHandler, WKNavigationDelegate {
  unowned let app: AppDelegate
  let id: Int
  let incognito: Bool
  var shell: ShellView!
  var tabs: TabHost!
  private var pendingUrls: [String]?
  private let glass = makeGlassBackground()
  private let frameView = FrameView(frame: .zero)

  init(app: AppDelegate, incognito: Bool, urls: [String]?) {
    self.app = app
    self.id = nextWindowId; nextWindowId += 1
    self.incognito = incognito
    self.pendingUrls = urls
    let win = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1360, height: 860),
                       styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView], backing: .buffered, defer: false)
    win.titlebarAppearsTransparent = true
    win.titleVisibility = .hidden
    win.minSize = NSSize(width: 720, height: 480)
    win.isMovableByWindowBackground = false
    win.setFrameAutosaveName("StupidBrowserWindow")
    win.backgroundColor = .clear
    win.isOpaque = false
    super.init(window: win)
    win.delegate = self

    let root = NSView()
    root.wantsLayer = true
    win.contentView = root
    glass.frame = root.bounds
    glass.autoresizingMask = [.width, .height]
    root.addSubview(glass)
    glass.isHidden = true   // only with Settings → glass (otherwise the exact Electron frame)
    frameView.frame = root.bounds
    frameView.autoresizingMask = [.width, .height]
    root.addSubview(frameView)

    tabs = TabHost(window: self)
    tabs.frame = root.bounds
    tabs.autoresizingMask = [.width, .height]
    root.addSubview(tabs)

    let cfg = WKWebViewConfiguration()
    cfg.setURLSchemeHandler(AppScheme(), forURLScheme: "app")
    cfg.userContentController.add(self, name: "host")
    cfg.userContentController.addUserScript(WKUserScript(source: Res.text(Res.mac.appendingPathComponent("js/host-shell.js")), injectionTime: .atDocumentStart, forMainFrameOnly: true))
    shell = ShellView(frame: root.bounds, configuration: cfg)
    shell.autoresizingMask = [.width, .height]
    shell.setValue(false, forKey: "drawsBackground")   // transparent where the UI is transparent (over the tabs)
    shell.navigationDelegate = self
    if #available(macOS 13.3, *) { shell.isInspectable = true }
    root.addSubview(shell)
    shell.load(URLRequest(url: URL(string: "app://shell/index.html")!))
  }
  required init?(coder: NSCoder) { fatalError() }

  // Events to the UI (Electron's webContents.send)
  func emit(_ channel: String, _ args: [Any]) {
    shell.evaluateJavaScript("window.__stupidHost && __stupidHost.emit(\(json(channel)), \(json(args)))", completionHandler: nil)
  }
  func reply(_ id: Int, _ ok: Bool, _ value: Any?) {
    shell.evaluateJavaScript("__stupidHost.reply(\(id), \(ok), \(json(value)))", completionHandler: nil)
  }

  func userContentController(_ c: WKUserContentController, didReceive m: WKScriptMessage) {
    guard let msg = m.body as? [String: Any], let type = msg["type"] as? String else { return }
    let rid = msg["id"] as? Int ?? 0
    switch type {
    case "invoke":
      let channel = msg["channel"] as? String ?? ""
      if let local = handleLocally(channel, msg["args"] as? [Any] ?? []) { reply(rid, true, local); return }
      var ctx: [String: Any] = ["window": id, "incognito": incognito]
      if channel == "win:info" { ctx["urls"] = pendingUrls as Any? ?? NSNull(); pendingUrls = nil }
      app.core.invoke(channel, msg["args"] ?? [], ctx: ctx) { [weak self] ok, v in self?.reply(rid, ok, v) }
    case "log":
      print("[ui] \(msg["text"] as? String ?? "")")
    case "layout":
      tabs.layout(msg["tabs"] as? [[String: Any]] ?? [], covers: msg["covers"] as? [[String: Any]] ?? [])
      if let f = msg["frame"] as? [String: Any], let bar = cssColor(f["bar"] as? String ?? "") {
        frameView.apply(bar: bar, accent: cssColor(f["accent"] as? String ?? "") ?? bar, modern: f["modern"] as? Bool ?? true, tint: f["tint"] as? String ?? "soft")
      }
    default:
      if type.hasPrefix("tab:") { tabs.handle(type, msg) }
    }
  }

  /// Window-level channels that need this window (the rest go to the core).
  private func handleLocally(_ channel: String, _ args: [Any]) -> Any? {
    switch channel {
    case "win:close": close(); return true
    case "win:fullscreen": window?.toggleFullScreen(nil); return true
    case "win:new":
      let o = args.first as? [String: Any]
      app.openWindow(incognito: o?["incognito"] as? Bool ?? false, urls: (o?["url"] as? String).map { [$0] }); return true
    case "win:trafficLights":
      let on = args.first as? Bool ?? true
      for b in [NSWindow.ButtonType.closeButton, .miniaturizeButton, .zoomButton] { window?.standardWindowButton(b)?.isHidden = !on }
      return true
    default: return nil
    }
  }

  func windowWillClose(_ n: Notification) {
    app.core.invoke("win:closed", [], ctx: ["window": id, "incognito": incognito]) { _, _ in }
    tabs.closeAll(); app.windowClosed(self)
  }

  /// History is recorded here, like the Electron main process watching webContents.
  func recordVisit(_ url: String, _ title: String, titleOnly: Bool = false) {
    guard !incognito, url.hasPrefix("http") else { return }
    app.core.invoke(titleOnly ? "history:title" : "history:visit", [url, title], ctx: ["window": id, "incognito": incognito]) { _, _ in }
  }

  // Dev self-test: STUPID_SNAPSHOT=/path.png saves a picture of the window (UI over tabs) after
  // STUPID_SNAPSHOT_DELAY ms (default 6000), then quits. STUPID_SNAPSHOT_JS runs in the UI first.
  func selfTest() {
    guard let path = ProcessInfo.processInfo.environment["STUPID_SNAPSHOT"] else { return }
    let delay = Double(ProcessInfo.processInfo.environment["STUPID_SNAPSHOT_DELAY"] ?? "") ?? 6000
    if let js = ProcessInfo.processInfo.environment["STUPID_SNAPSHOT_JS"], let code = try? String(contentsOfFile: js, encoding: .utf8) {
      DispatchQueue.main.asyncAfter(deadline: .now() + 2.5) { [weak self] in self?.shell.evaluateJavaScript(code) { _, e in if let e { print("[stupid] js error \(e)") } } }
    }
    DispatchQueue.main.asyncAfter(deadline: .now() + delay / 1000) { [weak self] in self?.snapshot(to: path) }
  }
  private func snapshot(to path: String) {
    guard let root = window?.contentView else { return }
    let size = root.bounds.size
    let image = NSImage(size: size)
    let group = DispatchGroup()
    var parts: [(NSRect, NSImage)] = []
    for v in tabs.subviews.compactMap({ $0 as? WKWebView }) where !v.isHidden {
      group.enter()
      v.takeSnapshot(with: nil) { img, _ in if let img { parts.append((v.frame, img)) }; group.leave() }
    }
    var shellImg: NSImage?
    group.enter(); shell.takeSnapshot(with: nil) { img, _ in shellImg = img; group.leave() }
    group.notify(queue: .main) {
      image.lockFocus()
      if let ctx = NSGraphicsContext.current?.cgContext, let layer = self.frameView.layer {   // the native frame (gradient)
        ctx.saveGState(); ctx.translateBy(x: 0, y: 0); layer.render(in: ctx); ctx.restoreGState()
      }
      for (f, img) in parts { img.draw(in: NSRect(x: f.minX, y: size.height - f.maxY, width: f.width, height: f.height)) }
      shellImg?.draw(in: NSRect(origin: .zero, size: size))
      image.unlockFocus()
      if let tiff = image.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff), let png = rep.representation(using: .png, properties: [:]) {
        try? png.write(to: URL(fileURLWithPath: path)); print("[stupid] snapshot saved \(path)")
      }
      NSApp.terminate(nil)
    }
  }
}
