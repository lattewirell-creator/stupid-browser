// Native tabs: one WKWebView per <webview> stand-in in the UI. Reports Electron-style webview events
// back to the stand-in (did-navigate, page-title-updated, did-stop-loading, …) and does what the UI
// asks (load, back, reload, executeJavaScript, zoom, find…). Page helpers (music island, Ask Buddy,
// passwords) run in an isolated world the page can't see, like Electron's preloads.
import Cocoa
import WebKit

/// Pages see this browser the way Safari introduces itself (it is Safari's engine): this is what
/// lets Google sign-in work, unlike Electron.
let userAgentProduct = "Version/\(safariVersion) Safari/605.1.15"
let sharedPool = WKProcessPool()
/// Our page helpers' own JavaScript world (Electron's isolated preload world).
let helperWorld = WKContentWorld.world(name: "stupid")
let FONT_SIZES: [String: Int] = ["small": 14, "medium": 16, "large": 19, "xlarge": 22]

final class Tab: NSObject {
  let id: Int
  let web: TabWebView
  let isTab: Bool          // a browser tab (not a sidebar app / AI panel)
  var observers: [NSKeyValueObservation] = []
  var lastURL = ""
  var audible = false
  var findText = "", findIndex = 0, findCount = 0
  var ctxInfo: [String: Any] = [:], ctxTime = Date.distantPast
  var isSpare = false
  init(id: Int, web: TabWebView, isTab: Bool) { self.id = id; self.web = web; self.isTab = isTab }
}

/// A tab's web view: shows the Electron version's page context menu (see PageMenu.swift).
final class TabWebView: WKWebView {
  weak var host: TabHost?
  override func willOpenMenu(_ menu: NSMenu, with event: NSEvent) {
    super.willOpenMenu(menu, with: event)
    host?.pageMenu(menu, for: self)
  }
}

final class TabHost: NSView, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler, WKScriptMessageHandlerWithReply {
  unowned let owner: BrowserWindow
  private(set) var tabs: [Int: Tab] = [:]
  lazy var privateStore = WKWebsiteDataStore.nonPersistent()   // one per private window, like Electron

  init(window: BrowserWindow) {
    self.owner = window
    super.init(frame: .zero)
    wantsLayer = true
  }
  required init?(coder: NSCoder) { fatalError() }
  override var isFlipped: Bool { true }
  private var app: AppDelegate { owner.app }

  private func script(_ name: String, _ world: WKContentWorld, allFrames: Bool = false) -> WKUserScript {
    WKUserScript(source: Res.text(Res.mac.appendingPathComponent("js/\(name)")), injectionTime: .atDocumentStart, forMainFrameOnly: !allFrames, in: world)
  }
  private func config(isTab: Bool) -> WKWebViewConfiguration {
    let cfg = WKWebViewConfiguration()
    cfg.processPool = sharedPool
    cfg.websiteDataStore = owner.incognito ? privateStore : app.profileStore
    cfg.applicationNameForUserAgent = userAgentProduct
    cfg.setURLSchemeHandler(StupidScheme(), forURLScheme: "stupid")
    cfg.preferences.isElementFullscreenEnabled = true
    cfg.allowsAirPlayForMediaPlayback = true
    cfg.mediaTypesRequiringUserActionForPlayback = []
    // Settings → font size (Electron's defaultFontSize; WebKit has it as a private preference).
    if cfg.preferences.responds(to: Selector(("_setDefaultFontSize:"))) {
      cfg.preferences.setValue(FONT_SIZES[app.settings["fontSize"] as? String ?? "medium"] ?? 16, forKey: "defaultFontSize")
    }
    let uc = cfg.userContentController
    uc.add(self, name: "page")
    uc.addScriptMessageHandler(self, contentWorld: helperWorld, name: "tab")
    installScripts(uc, isTab: isTab)
    return cfg
  }

  /// Page helpers and Shield, per tab (again when Shield is switched on or off).
  private func installScripts(_ uc: WKUserContentController, isTab: Bool) {
    uc.removeAllUserScripts()
    uc.addUserScript(script("host-page.js", .page))                 // window.stupid for stupid:// pages
    uc.addUserScript(script("gen-media.js", .page))                 // music island + equalizer
    uc.addUserScript(script("tab-events.js", helperWorld))
    uc.addUserScript(script("tab-ctx.js", helperWorld, allFrames: true))
    if isTab { uc.addUserScript(script("gen-select.js", helperWorld)) }
    if isTab && !owner.incognito { uc.addUserScript(script("gen-pw.js", helperWorld, allFrames: true)) }
    if app.settings["dnt"] as? Bool == true {
      uc.addUserScript(WKUserScript(source: "try { Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', { get: () => true }); Object.defineProperty(Navigator.prototype, 'doNotTrack', { get: () => '1' }); } catch {}",
                                    injectionTime: .atDocumentStart, forMainFrameOnly: false, in: .page))
    }
    let shield = isTab && (app.settings["adblock"] as? Bool ?? true)
    if let list = Blocker.list { uc.remove(list); if shield { uc.add(list) } }
    if shield && !Blocker.genericScript.isEmpty { uc.addUserScript(WKUserScript(source: Blocker.genericScript, injectionTime: .atDocumentStart, forMainFrameOnly: true, in: helperWorld)) }
  }

  func tab(for web: WKWebView) -> Tab? { tabs.values.first { $0.web === web } }
  func send(_ t: Tab, _ name: String, _ detail: [String: Any] = [:]) {
    owner.shell.evaluateJavaScript("__stupidHost.tabEvent(\(t.id), \(json(name)), \(json(detail)))", completionHandler: nil)
  }
  private func state(_ t: Tab) -> [String: Any] { ["canBack": t.web.canGoBack, "canFwd": t.web.canGoForward] }
  private var ctx: [String: Any] { ["window": owner.id, "incognito": owner.incognito] }

  // MARK: requests from the UI
  func handle(_ type: String, _ m: [String: Any]) {
    let id = m["tab"] as? Int ?? 0
    if type == "tab:create" { create(id, url: m["url"] as? String ?? "about:blank", partition: m["partition"] as? String ?? ""); return }
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
    case "tab:devtools": showInspector(t.web)
    default: break
    }
  }

  private func create(_ id: Int, url: String, partition: String) {
    let isTab = !partition.hasSuffix(":ai") && !partition.hasSuffix(":apps")
    let web = TabWebView(frame: .zero, configuration: config(isTab: isTab))
    web.host = self
    web.navigationDelegate = self
    web.uiDelegate = self
    web.allowsBackForwardNavigationGestures = true
    web.allowsMagnification = true
    web.isHidden = true
    web.wantsLayer = true
    web.layer?.masksToBounds = true
    if #available(macOS 13.3, *) { web.isInspectable = true }
    if ProcessInfo.processInfo.environment["STUPID_TEST_FRONT"] != nil { web.setValue(false, forKey: "windowOcclusionDetectionEnabled") }   // benchmarks: as if on screen
    let t = Tab(id: id, web: web, isTab: isTab)
    tabs[id] = t
    if web.responds(to: Selector(("_isPlayingAudio"))) { web.addObserver(self, forKeyPath: "_isPlayingAudio", options: [.new], context: nil) }
    addSubview(web)
    t.observers = [
      web.observe(\.title) { [weak self] w, _ in
        guard let self, let t = self.tab(for: w) else { return }
        self.send(t, "page-title-updated", ["title": w.title ?? ""])
        if t.isTab, let u = w.url?.absoluteString, let title = w.title, !title.isEmpty { self.owner.recordVisit(u, title, titleOnly: true) }
      },
      web.observe(\.url) { [weak self] w, _ in
        // Same-document changes (pushState, #hash) don't go through the navigation delegate.
        guard let self, let t = self.tab(for: w), let u = w.url?.absoluteString, u != t.lastURL, !w.isLoading else { return }
        t.lastURL = u; self.send(t, "did-navigate-in-page", ["url": u, "isMainFrame": true].merging(self.state(t)) { a, _ in a })
        if t.isTab { self.owner.recordVisit(u, w.title ?? "") }
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

  func load(_ t: Tab, _ s: String) {
    guard let u = URL(string: s), let scheme = u.scheme?.lowercased() else { return }
    if ["http", "https", "stupid", "about", "data", "file", "blob"].contains(scheme) || s == "about:blank" {
      if scheme == "file" { t.web.loadFileURL(u, allowingReadAccessTo: u.deletingLastPathComponent()) } else { t.web.load(URLRequest(url: u)) }
    }
  }

  private func destroy(_ t: Tab) {
    t.observers.forEach { $0.invalidate() }
    if t.web.responds(to: Selector(("_isPlayingAudio"))) { t.web.removeObserver(self, forKeyPath: "_isPlayingAudio") }
    t.web.stopLoading()
    t.web.configuration.userContentController.removeAllScriptMessageHandlers()
    t.web.removeFromSuperview()
    tabs.removeValue(forKey: t.id)
  }
  func closeAll() { tabs.values.forEach(destroy) }

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
  /// For the core (Buddy, Rewind): evaluate in our helper world, where the page can't interfere.
  func evalHelper(_ t: Tab, _ code: String, done: @escaping (Bool, Any?) -> Void) {
    t.web.callAsyncJavaScript("return (\n\(code)\n)", arguments: [:], in: nil, in: helperWorld) { r in
      switch r { case .success(let v): done(true, v); case .failure(let e): done(false, "\(e)") }
    }
  }

  /// Find in page with Electron's match counts ("2 of 7"): WebKit finds and highlights, a quick count in
  /// the page's text gives the total.
  private func find(_ t: Tab, _ text: String, forward: Bool) {
    guard #available(macOS 13.0, *) else { return }
    if text.isEmpty { t.findText = ""; t.web.evaluateJavaScript("getSelection().removeAllRanges()", in: nil, in: helperWorld, completionHandler: nil); return }
    let report = { [weak self] (found: Bool) in
      self?.send(t, "found-in-page", ["result": ["requestId": 1, "activeMatchOrdinal": found ? t.findIndex : 0, "matches": found ? t.findCount : 0, "finalUpdate": true]])
    }
    let go = {
      let c = WKFindConfiguration(); c.backwards = !forward; c.wraps = true; c.caseSensitive = false
      t.web.find(text, configuration: c) { r in report(r.matchFound) }
    }
    if text != t.findText {
      t.findText = text; t.findIndex = 1
      let count = "((t) => { const s = (document.body ? document.body.innerText : '').toLowerCase(); let n = 0, i = 0; while ((i = s.indexOf(t, i)) >= 0) { n++; i += t.length; } return n; })(\(json(text.lowercased())))"
      t.web.evaluateJavaScript(count, in: nil, in: helperWorld) { r in
        if case .success(let v) = r { t.findCount = max(1, (v as? Int) ?? 1) } else { t.findCount = 1 }
        go()
      }
    } else {
      let n = max(1, t.findCount)
      t.findIndex = forward ? t.findIndex % n + 1 : (t.findIndex - 2 + n) % n + 1
      go()
    }
  }

  /// Web Inspector (WebKit's developer tools).
  func showInspector(_ w: WKWebView) {
    guard w.responds(to: Selector(("_inspector"))), let insp = w.value(forKey: "_inspector") as? NSObject, insp.responds(to: Selector(("show"))) else { return }
    insp.perform(Selector(("show")))
  }

  /// The tab's sound icon: WebKit announces when a page starts or stops playing audio (what Safari's tab
  /// speaker uses), so no tab is woken up to ask.
  override func observeValue(forKeyPath keyPath: String?, of object: Any?, change: [NSKeyValueChangeKey: Any]?, context: UnsafeMutableRawPointer?) {
    guard keyPath == "_isPlayingAudio", let w = object as? WKWebView, let t = tab(for: w) else { return }
    let now = (w.value(forKey: "_isPlayingAudio") as? Bool) ?? false
    if now != t.audible { t.audible = now; send(t, "state", ["audible": now]) }
  }

  // MARK: settings that change running tabs
  func setAdblock(_ on: Bool) {
    for t in tabs.values where t.isTab { installScripts(t.web.configuration.userContentController, isTab: true) }
  }
  func pushEq(_ eq: Any) {
    for t in tabs.values where t.web.url?.scheme?.hasPrefix("http") == true {
      t.web.evaluateJavaScript("window.__stupidMedia && window.__stupidMedia.setEq(\(json(eq)))", completionHandler: nil)
    }
  }

  // MARK: layout from the UI
  func layout(_ list: [[String: Any]], covers: [[String: Any]]) {
    var pass: [NSRect] = []
    CATransaction.begin(); CATransaction.setDisableActions(true)
    for d in list {
      guard let id = d["tab"] as? Int, let t = tabs[id] else { continue }
      let r = NSRect(x: d["x"] as? Double ?? 0, y: d["y"] as? Double ?? 0, width: d["w"] as? Double ?? 0, height: d["h"] as? Double ?? 0)
      let shown = d["shown"] as? Bool ?? false, spare = d["spare"] as? Bool ?? false
      if t.web.frame != r { t.web.frame = r }
      t.web.layer?.cornerRadius = CGFloat(d["radius"] as? Double ?? 0)
      // Shown tabs follow the UI's fade-in; the prepared new tab stays drawn but invisible, under the others.
      let alpha = shown ? CGFloat(d["opacity"] as? Double ?? 1) : 0
      if t.web.alphaValue != alpha { t.web.alphaValue = alpha }
      let hide = !shown && !spare
      if t.web.isHidden != hide { t.web.isHidden = hide }
      if spare != t.isSpare {
        t.isSpare = spare
        if spare { addSubview(t.web, positioned: .below, relativeTo: nil) } else { addSubview(t.web, positioned: .above, relativeTo: nil) }
      }
      if shown { pass.append(r) }
    }
    CATransaction.commit()
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
    t.findText = ""
    send(t, "did-navigate", ["url": t.lastURL, "isMainFrame": true].merging(state(t)) { a, _ in a })
    if t.isTab { owner.recordVisit(t.lastURL, w.title ?? "") }
  }
  func webView(_ w: WKWebView, didFinish _: WKNavigation!) { if let t = tab(for: w) { send(t, "did-stop-loading", state(t)) } }
  func webView(_ w: WKWebView, didFail _: WKNavigation!, withError e: Error) { failed(w, e) }
  func webView(_ w: WKWebView, didFailProvisionalNavigation _: WKNavigation!, withError e: Error) { failed(w, e) }
  private func failed(_ w: WKWebView, _ e: Error) {
    guard let t = tab(for: w) else { return }
    let err = e as NSError
    // Cancelled, or "frame load interrupted" because the response became a download: not an error page.
    if err.code == NSURLErrorCancelled || (err.domain == "WebKitErrorDomain" && err.code == 102) { send(t, "did-stop-loading", state(t)); return }
    send(t, "did-fail-load", ["errorCode": err.code, "errorDescription": err.localizedDescription, "validatedURL": (err.userInfo[NSURLErrorFailingURLStringErrorKey] as? String) ?? "", "isMainFrame": true])
    send(t, "did-stop-loading", state(t))
  }
  func webViewWebContentProcessDidTerminate(_ w: WKWebView) { if let t = tab(for: w) { send(t, "render-process-gone", ["details": ["reason": "crashed"]]) } }

  // Links that open a new window open as a tab, like the Electron app.
  func webView(_ w: WKWebView, createWebViewWith _: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures _: WKWindowFeatures) -> WKWebView? {
    if let u = action.request.url?.absoluteString {
      if u.hasPrefix("mailto:") { NSWorkspace.shared.open(action.request.url!); return nil }
      guard u.hasPrefix("http") || u.hasPrefix("stupid:") else { return nil }
      let bg = action.modifierFlags.contains(.command)
      owner.emit("open-url", [["url": u, "where": bg ? "background" : "foreground", "opener": tab(for: w)?.id as Any? ?? NSNull()]])
    }
    return nil
  }
  func webView(_ w: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
    guard let u = action.request.url, let scheme = u.scheme?.lowercased() else { return decisionHandler(.cancel) }
    if action.shouldPerformDownload { return decisionHandler(.download) }
    if ["http", "https", "stupid", "about", "data", "blob", "file"].contains(scheme) { return decisionHandler(.allow) }
    if ["mailto", "tel", "zoommtg", "msteams", "spotify", "discord", "steam"].contains(scheme) { NSWorkspace.shared.open(u) }
    decisionHandler(.cancel)
  }
  // Files the page can't show (or sent as attachments) are downloaded, like Chrome.
  func webView(_ w: WKWebView, decidePolicyFor r: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
    let attachment = ((r.response as? HTTPURLResponse)?.value(forHTTPHeaderField: "Content-Disposition") ?? "").lowercased().hasPrefix("attachment")
    decisionHandler(!r.canShowMIMEType || (attachment && r.isForMainFrame) ? .download : .allow)
  }
  func webView(_ w: WKWebView, navigationAction _: WKNavigationAction, didBecome d: WKDownload) { app.downloads.adopt(d, window: owner) }
  func webView(_ w: WKWebView, navigationResponse _: WKNavigationResponse, didBecome d: WKDownload) { app.downloads.adopt(d, window: owner) }

  // Shield's blocked-request counter (WebKit tells its delegate about content-blocker actions).
  @objc(_webView:contentRuleListWithIdentifier:performedAction:forURL:)
  func contentRuleListPerformed(_ w: WKWebView, identifier: String, action: NSObject, url: URL) {
    if action.responds(to: Selector(("blockedLoad"))), (action.value(forKey: "blockedLoad") as? Bool) == false { return }
    Blocker.counted()
  }

  // MARK: permissions (camera, microphone, location) → the same per-site allow/ask/block as Electron
  private func originString(_ o: WKSecurityOrigin) -> String { "\(o.protocol)://\(o.host)" + (o.port != 0 ? ":\(o.port)" : "") }
  private func askPermission(_ w: WKWebView, _ origin: String, _ kinds: [String], _ done: @escaping (Bool) -> Void) {
    guard let t = tab(for: w) else { return done(false) }
    app.core.invoke("perm:request", [origin, kinds], ctx: ctx.merging(["tab": t.id]) { a, _ in a }) { ok, v in done(ok && (v as? Bool ?? false)) }
  }
  @available(macOS 12.0, *)
  func webView(_ w: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame _: WKFrameInfo, type: WKMediaCaptureType, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
    let kinds = type == .camera ? ["camera"] : type == .microphone ? ["microphone"] : ["camera", "microphone"]
    askPermission(w, originString(origin), kinds) { decisionHandler($0 ? .grant : .deny) }
  }
  @objc(_webView:requestGeolocationPermissionForOrigin:initiatedByFrame:decisionHandler:)
  func geolocation(_ w: WKWebView, origin: WKSecurityOrigin, frame _: WKFrameInfo, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
    askPermission(w, originString(origin), ["location"]) { decisionHandler($0 ? .grant : .deny) }
  }
  @objc(_webView:requestGeolocationPermissionForFrame:decisionHandler:)
  func geolocationOld(_ w: WKWebView, frame: WKFrameInfo, decisionHandler: @escaping (Bool) -> Void) {
    askPermission(w, originString(frame.securityOrigin), ["location"], decisionHandler)
  }
  // JavaScript alert / confirm / prompt as sheets on the window.
  func webView(_ w: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame _: WKFrameInfo, completionHandler: @escaping () -> Void) {
    let a = NSAlert(); a.messageText = w.url?.host ?? ""; a.informativeText = message
    guard let win = owner.window else { completionHandler(); return }
    a.beginSheetModal(for: win) { _ in completionHandler() }
  }
  func webView(_ w: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame _: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
    let a = NSAlert(); a.messageText = w.url?.host ?? ""; a.informativeText = message; a.addButton(withTitle: "OK"); a.addButton(withTitle: "Cancel")
    guard let win = owner.window else { completionHandler(false); return }
    a.beginSheetModal(for: win) { completionHandler($0 == .alertFirstButtonReturn) }
  }
  func webView(_ w: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?, initiatedByFrame _: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
    let a = NSAlert(); a.messageText = w.url?.host ?? ""; a.informativeText = prompt; a.addButton(withTitle: "OK"); a.addButton(withTitle: "Cancel")
    let field = NSTextField(frame: NSRect(x: 0, y: 0, width: 260, height: 24)); field.stringValue = defaultText ?? ""; a.accessoryView = field
    guard let win = owner.window else { completionHandler(nil); return }
    a.beginSheetModal(for: win) { completionHandler($0 == .alertFirstButtonReturn ? field.stringValue : nil) }
  }
  // <input type=file>
  func webView(_ w: WKWebView, runOpenPanelWith p: WKOpenPanelParameters, initiatedByFrame _: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
    let panel = NSOpenPanel(); panel.allowsMultipleSelection = p.allowsMultipleSelection; panel.canChooseDirectories = p.allowsDirectories
    guard let win = owner.window else { completionHandler(nil); return }
    panel.beginSheetModal(for: win) { completionHandler($0 == .OK ? panel.urls : nil) }
  }

  /// Our pages (stupid://…) calling the core: only from a stupid:// top frame, like the Electron app's isInternal check.
  private func pageCall(_ m: WKScriptMessage) {
    if let log = (m.body as? [String: Any])?["log"] as? String { print("[page] \(log)"); return }
    guard m.frameInfo.isMainFrame, m.frameInfo.securityOrigin.protocol == "stupid", let w = m.webView,
          let msg = m.body as? [String: Any], let id = msg["id"] as? Int, let channel = msg["channel"] as? String else { return }
    app.core.invoke(channel, msg["args"] ?? [], ctx: ctx.merging(["page": w.url?.absoluteString ?? ""]) { a, _ in a }) { ok, v in
      w.evaluateJavaScript("window.__stupidPage && __stupidPage.reply(\(id), \(ok), \(json(v)))", completionHandler: nil)
    }
  }
  func userContentController(_ c: WKUserContentController, didReceive m: WKScriptMessage) { if m.name == "page" { pageCall(m) } }

  // Messages from our page helpers (isolated world): tab-events.js, tab-ctx.js, gen-select.js, gen-pw.js
  func userContentController(_ c: WKUserContentController, didReceive m: WKScriptMessage, replyHandler: @escaping (Any?, String?) -> Void) {
    guard let w = m.webView, let t = tab(for: w), let msg = m.body as? [String: Any], let type = msg["type"] as? String else { return replyHandler(nil, nil) }
    let origin = originString(m.frameInfo.securityOrigin)
    switch type {
    case "dom-ready":
      send(t, "dom-ready")
      if let eq = app.settings["eq"] as? [String: Any], eq["on"] as? Bool == true { pushEqTo(t, eq) }
      if t.isTab, app.settings["adblock"] as? Bool ?? true, let u = w.url?.absoluteString {
        app.core.invoke("ads:css", [u], ctx: ctx) { ok, css in
          guard ok, let css = css as? String, !css.isEmpty else { return }
          w.evaluateJavaScript("(() => { const s = document.createElement('style'); s.textContent = \(json(css)); (document.head || document.documentElement).appendChild(s); })()", in: nil, in: helperWorld, completionHandler: nil)
        }
      }
    case "favicons": send(t, "page-favicon-updated", ["favicons": msg["list"] as? [String] ?? []])
    case "target-url": send(t, "update-target-url", ["url": msg["url"] as? String ?? ""])
    case "focus": send(t, "focus")
    case "ipc": send(t, "ipc-message", ["channel": msg["channel"] as? String ?? "", "args": msg["args"] as? [Any] ?? []])
    case "ctx": t.ctxInfo = msg; t.ctxTime = Date()
    case "pw:query":
      guard t.isTab, !owner.incognito else { return replyHandler([], nil) }
      app.core.invoke("pw:query", [], ctx: ctx.merging(["origin": origin]) { a, _ in a }) { ok, v in replyHandler(ok ? v : [], nil) }
      return
    case "pw:submitted":
      if t.isTab, !owner.incognito { app.core.invoke("pw:submitted", [msg["data"] ?? NSNull()], ctx: ctx.merging(["origin": origin, "tab": t.id]) { a, _ in a }) { _, _ in } }
    default: break
    }
    replyHandler(nil, nil)
  }
  private func pushEqTo(_ t: Tab, _ eq: Any) { t.web.evaluateJavaScript("window.__stupidMedia && window.__stupidMedia.setEq(\(json(eq)))", completionHandler: nil) }
}
