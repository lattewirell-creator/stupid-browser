// Native tabs: one WKWebView per <webview> stand-in in the UI. Reports Electron-style webview events
// back to the stand-in (did-navigate, page-title-updated, did-stop-loading, …) and does what the UI
// asks (load, back, reload, executeJavaScript, zoom, find…).
import Cocoa
import WebKit

/// Pages see this browser the way Safari introduces itself (it is Safari's engine): this is what
/// lets Google sign-in work, unlike Electron.
let userAgentProduct = "Version/\(safariVersion) Safari/605.1.15"
let sharedPool = WKProcessPool()

final class Tab: NSObject {
  let id: Int
  let web: WKWebView
  var observers: [NSKeyValueObservation] = []
  var lastURL = ""
  var audible = false
  init(id: Int, web: WKWebView) { self.id = id; self.web = web }
}

final class TabHost: NSView, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
  unowned let owner: BrowserWindow
  private(set) var tabs: [Int: Tab] = [:]
  private lazy var privateStore = WKWebsiteDataStore.nonPersistent()   // one per private window, like Electron
  private var audioTimer: Timer?

  init(window: BrowserWindow) {
    self.owner = window
    super.init(frame: .zero)
    wantsLayer = true
    audioTimer = Timer.scheduledTimer(withTimeInterval: 1.2, repeats: true) { [weak self] _ in self?.pollAudio() }
  }
  required init?(coder: NSCoder) { fatalError() }
  override var isFlipped: Bool { true }

  private func config() -> WKWebViewConfiguration {
    let cfg = WKWebViewConfiguration()
    cfg.processPool = sharedPool
    cfg.websiteDataStore = owner.incognito ? privateStore : .default()
    cfg.applicationNameForUserAgent = userAgentProduct
    cfg.setURLSchemeHandler(StupidScheme(), forURLScheme: "stupid")
    cfg.preferences.isElementFullscreenEnabled = true
    cfg.allowsAirPlayForMediaPlayback = true
    cfg.mediaTypesRequiringUserActionForPlayback = []
    let uc = cfg.userContentController
    uc.add(self, name: "tab")
    uc.addUserScript(WKUserScript(source: Res.text(Res.mac.appendingPathComponent("js/tab-events.js")), injectionTime: .atDocumentStart, forMainFrameOnly: true))
    return cfg
  }

  func tab(for web: WKWebView) -> Tab? { tabs.values.first { $0.web === web } }
  private func send(_ t: Tab, _ name: String, _ detail: [String: Any] = [:]) {
    owner.shell.evaluateJavaScript("__stupidHost.tabEvent(\(t.id), \(json(name)), \(json(detail)))", completionHandler: nil)
  }
  private func state(_ t: Tab) -> [String: Any] { ["canBack": t.web.canGoBack, "canFwd": t.web.canGoForward] }

  // MARK: requests from the UI
  func handle(_ type: String, _ m: [String: Any]) {
    let id = m["tab"] as? Int ?? 0
    if type == "tab:create" { create(id, url: m["url"] as? String ?? "about:blank"); return }
    guard let t = tabs[id] else { return }
    switch type {
    case "tab:destroy": destroy(t)
    case "tab:load": load(t, m["url"] as? String ?? "")
    case "tab:back": t.web.goBack()
    case "tab:forward": t.web.goForward()
    case "tab:reload": (m["hard"] as? Bool ?? false) ? t.web.reloadFromOrigin() : t.web.reload()
    case "tab:stop": t.web.stopLoading()
    case "tab:focus": owner.window?.makeFirstResponder(t.web)
    case "tab:zoom": t.web.pageZoom = CGFloat(m["zoom"] as? Double ?? 1); send(t, "state", ["zoom": Double(t.web.pageZoom)])
    case "tab:mute":
      let muted = m["muted"] as? Bool ?? false
      t.web.evaluateJavaScript("window.__stupidMuted = \(muted); document.querySelectorAll('video,audio').forEach(m => m.muted = \(muted))", completionHandler: nil)
    case "tab:exec": exec(t, m["code"] as? String ?? "", reply: m["id"] as? Int ?? 0)
    case "tab:print": t.web.printOperation(with: NSPrintInfo.shared).runModal(for: owner.window!, delegate: nil, didRun: nil, contextInfo: nil)
    case "tab:find": find(t, m["text"] as? String ?? "", forward: m["forward"] as? Bool ?? true)
    case "tab:devtools": break   // Web Inspector: right-click → Inspect Element (pages are inspectable)
    default: break
    }
  }

  private func create(_ id: Int, url: String) {
    let web = WKWebView(frame: .zero, configuration: config())
    web.navigationDelegate = self
    web.uiDelegate = self
    web.allowsBackForwardNavigationGestures = true
    web.allowsMagnification = true
    web.isHidden = true
    web.wantsLayer = true
    web.layer?.masksToBounds = true
    if #available(macOS 13.3, *) { web.isInspectable = true }
    let t = Tab(id: id, web: web)
    tabs[id] = t
    addSubview(web)
    t.observers = [
      web.observe(\.title) { [weak self] w, _ in
        guard let self, let t = self.tab(for: w) else { return }
        self.send(t, "page-title-updated", ["title": w.title ?? ""])
        if let u = w.url?.absoluteString, let title = w.title, !title.isEmpty { self.owner.recordVisit(u, title, titleOnly: true) }
      },
      web.observe(\.url) { [weak self] w, _ in
        // Same-document changes (pushState, #hash) don't go through the navigation delegate.
        guard let self, let t = self.tab(for: w), let u = w.url?.absoluteString, u != t.lastURL, !w.isLoading else { return }
        t.lastURL = u; self.send(t, "did-navigate-in-page", ["url": u, "isMainFrame": true].merging(self.state(t)) { a, _ in a })
      },
      web.observe(\.canGoBack) { [weak self] w, _ in guard let self, let t = self.tab(for: w) else { return }; self.send(t, "state", self.state(t)) },
      web.observe(\.canGoForward) { [weak self] w, _ in guard let self, let t = self.tab(for: w) else { return }; self.send(t, "state", self.state(t)) },
    ]
    if #available(macOS 13.0, *) {
      t.observers.append(web.observe(\.fullscreenState) { [weak self] w, _ in
        guard let self, let t = self.tab(for: w) else { return }
        if w.fullscreenState == .inFullscreen { self.send(t, "enter-html-full-screen") } else if w.fullscreenState == .notInFullscreen { self.send(t, "leave-html-full-screen") }
      })
    }
    load(t, url)
  }

  private func load(_ t: Tab, _ s: String) {
    guard let u = URL(string: s), let scheme = u.scheme?.lowercased() else { return }
    if ["http", "https", "stupid", "about", "data", "file", "blob"].contains(scheme) || s == "about:blank" {
      if scheme == "file" { t.web.loadFileURL(u, allowingReadAccessTo: u.deletingLastPathComponent()) } else { t.web.load(URLRequest(url: u)) }
    }
  }

  private func destroy(_ t: Tab) {
    t.observers.forEach { $0.invalidate() }
    t.web.stopLoading()
    t.web.configuration.userContentController.removeAllScriptMessageHandlers()
    t.web.removeFromSuperview()
    tabs.removeValue(forKey: t.id)
  }
  func closeAll() { tabs.values.forEach(destroy); audioTimer?.invalidate() }

  /// Electron's executeJavaScript: evaluate in the page, wait if it's a promise, return a plain value.
  private func exec(_ t: Tab, _ code: String, reply rid: Int) {
    t.web.callAsyncJavaScript("return await (\n\(code)\n)", arguments: [:], in: nil, in: .page) { [weak self] r in
      switch r {
      case .success(let v): self?.owner.reply(rid, true, v)
      case .failure:
        t.web.evaluateJavaScript(code) { v, err in self?.owner.reply(rid, err == nil, err == nil ? v : "\(err!)") }
      }
    }
  }

  private func find(_ t: Tab, _ text: String, forward: Bool) {
    guard #available(macOS 13.0, *) else { return }
    if text.isEmpty { t.web.evaluateJavaScript("getSelection().removeAllRanges()", completionHandler: nil); return }
    let c = WKFindConfiguration(); c.backwards = !forward; c.wraps = true; c.caseSensitive = false
    t.web.find(text, configuration: c) { [weak self] r in
      self?.send(t, "found-in-page", ["result": ["activeMatchOrdinal": r.matchFound ? 1 : 0, "matches": r.matchFound ? 1 : 0, "finalUpdate": true]])
    }
  }

  private func pollAudio() {
    guard #available(macOS 12.0, *) else { return }
    for t in tabs.values where !t.web.isHidden || t.audible || true {
      t.web.requestMediaPlaybackState { [weak self] st in
        let now = st == .playing
        if now != t.audible { t.audible = now; self?.send(t, "state", ["audible": now]) }
      }
    }
  }

  // MARK: layout from the UI
  func layout(_ list: [[String: Any]], covers: [[String: Any]]) {
    var pass: [NSRect] = []
    for d in list {
      guard let id = d["tab"] as? Int, let t = tabs[id] else { continue }
      let r = NSRect(x: d["x"] as? Double ?? 0, y: d["y"] as? Double ?? 0, width: d["w"] as? Double ?? 0, height: d["h"] as? Double ?? 0)
      let shown = d["shown"] as? Bool ?? false
      t.web.frame = r
      t.web.layer?.cornerRadius = CGFloat(d["radius"] as? Double ?? 0)
      t.web.isHidden = !shown
      if shown { pass.append(r) }
    }
    owner.shell.passRects = pass
    owner.shell.coverRects = covers.map { NSRect(x: $0["x"] as? Double ?? 0, y: $0["y"] as? Double ?? 0, width: $0["w"] as? Double ?? 0, height: $0["h"] as? Double ?? 0) }
  }

  /// Our pages (stupid://…) listen to core events through their bridge.
  func emitToPages(_ channel: String, _ args: [Any]) {
    for t in tabs.values where t.web.url?.scheme == "stupid" {
      t.web.evaluateJavaScript("window.__stupidPage && __stupidPage.emit(\(json(channel)), \(json(args)))", completionHandler: nil)
    }
  }

  // MARK: navigation events → Electron webview events
  func webView(_ w: WKWebView, didStartProvisionalNavigation _: WKNavigation!) { if let t = tab(for: w) { send(t, "did-start-loading") } }
  func webView(_ w: WKWebView, didCommit _: WKNavigation!) {
    guard let t = tab(for: w) else { return }
    t.lastURL = w.url?.absoluteString ?? ""
    send(t, "did-navigate", ["url": t.lastURL, "isMainFrame": true].merging(state(t)) { a, _ in a })
    owner.recordVisit(t.lastURL, w.title ?? "")
  }
  func webView(_ w: WKWebView, didFinish _: WKNavigation!) { if let t = tab(for: w) { send(t, "did-stop-loading", state(t)) } }
  func webView(_ w: WKWebView, didFail _: WKNavigation!, withError e: Error) { failed(w, e) }
  func webView(_ w: WKWebView, didFailProvisionalNavigation _: WKNavigation!, withError e: Error) { failed(w, e) }
  private func failed(_ w: WKWebView, _ e: Error) {
    guard let t = tab(for: w) else { return }
    let err = e as NSError
    if err.code == NSURLErrorCancelled { send(t, "did-stop-loading", state(t)); return }
    send(t, "did-fail-load", ["errorCode": err.code, "errorDescription": err.localizedDescription, "validatedURL": (err.userInfo[NSURLErrorFailingURLStringErrorKey] as? String) ?? "", "isMainFrame": true])
    send(t, "did-stop-loading", state(t))
  }
  func webViewWebContentProcessDidTerminate(_ w: WKWebView) { if let t = tab(for: w) { send(t, "render-process-gone", ["details": ["reason": "crashed"]]) } }

  // Links that open a new window open as a tab, like the Electron app.
  func webView(_ w: WKWebView, createWebViewWith _: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures _: WKWindowFeatures) -> WKWebView? {
    if let u = action.request.url?.absoluteString {
      let bg = action.modifierFlags.contains(.command)
      owner.emit("open-url", [["url": u, "where": bg ? "background" : "foreground", "opener": tab(for: w)?.id as Any? ?? NSNull()]])
    }
    return nil
  }
  func webView(_ w: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
    guard let u = action.request.url, let scheme = u.scheme?.lowercased() else { return decisionHandler(.cancel) }
    if ["http", "https", "stupid", "about", "data", "blob", "file"].contains(scheme) { return decisionHandler(.allow) }
    if scheme == "mailto" || scheme == "tel" { NSWorkspace.shared.open(u) }
    decisionHandler(.cancel)
  }

  // Messages from tab-events.js (page side)
  func userContentController(_ c: WKUserContentController, didReceive m: WKScriptMessage) {
    guard let w = m.webView, let t = tab(for: w), let msg = m.body as? [String: Any], let type = msg["type"] as? String else { return }
    switch type {
    case "dom-ready": send(t, "dom-ready")
    case "favicons": send(t, "page-favicon-updated", ["favicons": msg["list"] as? [String] ?? []])
    case "target-url": send(t, "update-target-url", ["url": msg["url"] as? String ?? ""])
    case "focus": send(t, "focus")
    case "ipc": send(t, "ipc-message", ["channel": msg["channel"] as? String ?? "", "args": msg["args"] as? [Any] ?? []])
    default: break
    }
  }
}
