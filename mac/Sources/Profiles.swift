// Profiles, like the Electron version (src/profiles.js): each profile has its own data folder and website
// data (cookies, logins) and runs as its own copy of the app. "default" uses the main folder. The list
// lives in the base folder (profiles.json), shared by all of them. Plus the "Who's browsing?" picker.
import Cocoa
import WebKit
import CryptoKit

enum Profiles {
  static let base: URL = {
    let u = ProcessInfo.processInfo.environment["STUPID_DATA_DIR"].map { URL(fileURLWithPath: $0) }   // tests
      ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("The Stupid Browser WebKit")
    try? FileManager.default.createDirectory(at: u, withIntermediateDirectories: true)
    return u
  }()
  static let current: String = {
    let arg = CommandLine.arguments.first { $0.hasPrefix("--profile=") }.map { String($0.dropFirst(10)) } ?? "default"
    return arg.range(of: #"^[a-z0-9]{1,24}$"#, options: .regularExpression) != nil ? arg : "default"
  }()
  static var dataDir: URL { current == "default" ? base : base.appendingPathComponent("Profiles/\(current)") }
  private static var listFile: URL { base.appendingPathComponent("profiles.json") }
  private static var prefFile: URL { base.appendingPathComponent("profiles-prefs.json") }

  static func list() -> [[String: Any]] {
    var l = ((try? Data(contentsOf: listFile)).flatMap { try? JSONSerialization.jsonObject(with: $0) } as? [[String: Any]]) ?? []
    if !l.contains(where: { $0["id"] as? String == "default" }) { l.insert(["id": "default", "name": "Default", "color": "clay"], at: 0) }
    return l.filter { ($0["id"] as? String ?? "").range(of: #"^[a-z0-9]{1,24}$"#, options: .regularExpression) != nil }
  }
  private static func save(_ l: [[String: Any]]) {
    guard let d = try? JSONSerialization.data(withJSONObject: l) else { return }
    try? d.write(to: listFile, options: .atomic)
  }
  /// Keep this profile's name/colour/email in the shared list current.
  static func sync(name: String, color: String, email: String) {
    var l = list()
    let i = l.firstIndex { $0["id"] as? String == current }
    let me = i.map { l[$0] }
    let next: [String: Any] = ["id": current, "name": name.trimmingCharacters(in: .whitespaces).isEmpty ? (me?["name"] as? String ?? "Profile") : name, "color": color.isEmpty ? "clay" : color, "email": email]
    if let me, me["name"] as? String == next["name"] as? String, me["color"] as? String == next["color"] as? String, (me["email"] as? String ?? "") == email { return }
    if let i { l[i] = next } else { l.append(next) }
    save(l)
  }
  static func create(name: String, color: String) -> [String: Any]? {
    var l = list()
    guard l.count < 20 else { return nil }
    let id = "p" + String(Int(Date().timeIntervalSince1970 * 1000), radix: 36)
    let n = name.trimmingCharacters(in: .whitespaces)
    let p: [String: Any] = ["id": id, "name": n.isEmpty ? "Profile \(l.count + 1)" : String(n.prefix(40)), "color": color.isEmpty ? "sky" : String(color.prefix(20))]
    l.append(p); save(l)
    // Seed its settings so the new browser greets the person by name.
    let dir = base.appendingPathComponent("Profiles/\(id)")
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    if let d = try? JSONSerialization.data(withJSONObject: ["name": p["name"]!, "profileColor": p["color"]!]) { try? d.write(to: dir.appendingPathComponent("settings.json")) }
    return p
  }
  /// Removing moves the profile's folder to the Trash (recoverable), never the current or default one.
  static func remove(_ id: String) -> Bool {
    guard id != "default", id != current else { return false }
    var l = list()
    guard let i = l.firstIndex(where: { $0["id"] as? String == id }) else { return false }
    l.remove(at: i); save(l)
    let dir = base.appendingPathComponent("Profiles/\(id)")
    if FileManager.default.fileExists(atPath: dir.path) { try? FileManager.default.trashItem(at: dir, resultingItemURL: nil) }
    if #available(macOS 14.0, *) { WKWebsiteDataStore.remove(forIdentifier: storeId(id)) { _ in } }
    return true
  }
  /// Start (or bring forward) another profile's browser.
  static func open(_ id: String) -> Bool {
    guard list().contains(where: { $0["id"] as? String == id }) else { return false }
    if id == current { NSApp.activate(ignoringOtherApps: true); return true }
    let p = Process()
    p.executableURL = URL(fileURLWithPath: "/usr/bin/open")
    var args = ["-n", "-a", Bundle.main.bundlePath]
    if let dd = ProcessInfo.processInfo.environment["STUPID_DATA_DIR"] { args += ["--env", "STUPID_DATA_DIR=\(dd)"] }
    p.arguments = args + ["--args", "--profile=\(id)"]
    try? p.run()
    return true
  }
  static func pickerEnabled() -> Bool {
    ((try? Data(contentsOf: prefFile)).flatMap { try? JSONSerialization.jsonObject(with: $0) } as? [String: Any])?["picker"] as? Bool ?? true
  }
  static func setPicker(_ on: Bool) -> Bool {
    if let d = try? JSONSerialization.data(withJSONObject: ["picker": on]) { try? d.write(to: prefFile) }
    return on
  }

  /// Website data (cookies, logins) of this profile. The default profile uses WebKit's default store.
  static func storeId(_ id: String) -> UUID {
    let h = Array(Insecure.MD5.hash(data: Data("stupid-profile-\(id)".utf8)))
    return UUID(uuid: (h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], h[8], h[9], h[10], h[11], h[12], h[13], h[14], h[15]))
  }
  static func websiteStore() -> WKWebsiteDataStore {
    if current != "default", #available(macOS 14.0, *) { return WKWebsiteDataStore(forIdentifier: storeId(current)) }
    return .default()
  }

  // MARK: one running copy per profile
  private static var lockFd: Int32 = -1
  private static var note: String { "com.emil.stupidbrowser.webkit.open.\(current)" }
  /// false when this profile is already open in another copy of the app (which is told to come forward).
  static func takeLock(urls: [String]) -> Bool {
    try? FileManager.default.createDirectory(at: dataDir, withIntermediateDirectories: true)
    lockFd = Darwin.open(dataDir.appendingPathComponent(".lock").path, O_CREAT | O_RDWR, 0o600)
    if lockFd >= 0 && flock(lockFd, LOCK_EX | LOCK_NB) == 0 { return true }
    let payload = (try? String(data: JSONSerialization.data(withJSONObject: urls), encoding: .utf8)) ?? "[]"
    DistributedNotificationCenter.default().postNotificationName(.init(note), object: payload, userInfo: nil, deliverImmediately: true)
    return false
  }
  /// Another launch of this profile asked us to open links (or just to come forward).
  static func listen(_ open: @escaping ([String]) -> Void) {
    DistributedNotificationCenter.default().addObserver(forName: .init(note), object: nil, queue: .main) { n in
      let urls = (n.object as? String).flatMap { try? JSONSerialization.jsonObject(with: Data($0.utf8)) as? [String] } ?? []
      NSApp.activate(ignoringOtherApps: true)
      open(urls)
    }
  }
}

/// "Who's browsing?" — shown at launch when there's more than one profile (src/picker.html, unchanged).
final class PickerWindow: NSWindowController, WKScriptMessageHandlerWithReply, NSWindowDelegate {
  unowned let app: AppDelegate
  private var chosen = false
  init(app: AppDelegate) {
    self.app = app
    let win = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 760, height: 540), styleMask: [.titled, .closable, .miniaturizable, .fullSizeContentView], backing: .buffered, defer: false)
    win.titlebarAppearsTransparent = true; win.titleVisibility = .hidden; win.title = "Who’s browsing?"
    super.init(window: win)
    win.delegate = self
    let cfg = WKWebViewConfiguration()
    cfg.setURLSchemeHandler(AppScheme(), forURLScheme: "app")
    cfg.userContentController.addScriptMessageHandler(self, contentWorld: .page, name: "picker")
    let bridge = """
    (() => { const call = (op, arg) => window.webkit.messageHandlers.picker.postMessage({ op, arg });
      window.picker = Object.freeze({ platform: 'darwin', list: () => call('list'), choose: (id) => call('choose', id), add: (p) => call('add', p), setShow: (on) => call('show', on) }); })();
    """
    cfg.userContentController.addUserScript(WKUserScript(source: bridge, injectionTime: .atDocumentStart, forMainFrameOnly: true))
    let web = WKWebView(frame: win.contentView!.bounds, configuration: cfg)
    web.autoresizingMask = [.width, .height]
    win.contentView = web
    web.load(URLRequest(url: URL(string: "app://shell/picker.html")!))
    win.center()
  }
  required init?(coder: NSCoder) { fatalError() }

  func userContentController(_ c: WKUserContentController, didReceive m: WKScriptMessage, replyHandler: @escaping (Any?, String?) -> Void) {
    guard let msg = m.body as? [String: Any], let op = msg["op"] as? String else { return replyHandler(nil, nil) }
    switch op {
    case "list": replyHandler(["list": Profiles.list(), "show": Profiles.pickerEnabled()], nil)
    case "show": replyHandler(Profiles.setPicker(msg["arg"] as? Bool ?? true), nil)
    case "add":
      let p = msg["arg"] as? [String: Any] ?? [:]
      guard let made = Profiles.create(name: p["name"] as? String ?? "", color: p["color"] as? String ?? "") else { return replyHandler(nil, nil) }
      replyHandler(true, nil)
      chosen = true; _ = Profiles.open(made["id"] as? String ?? ""); close(); quitIfNothingOpen()
    case "choose":
      let id = msg["arg"] as? String ?? "default"
      replyHandler(true, nil)
      chosen = true
      if id == "default" { app.openStartupWindows([]); close() }
      else { _ = Profiles.open(id); close(); quitIfNothingOpen() }
    default: replyHandler(nil, nil)
    }
  }
  private func quitIfNothingOpen() { DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { [weak self] in if self?.app.windows.isEmpty ?? true { NSApp.terminate(nil) } } }
  func windowWillClose(_ n: Notification) { app.pickerClosed(chosen: chosen) }
}
