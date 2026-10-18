// The core: a hidden WKWebView running mac/core/core.js, the browser logic (settings, bookmarks,
// history, downloads, …) ported from the Electron main process. Windows and pages call it with
// invoke(channel, args); it answers, broadcasts events, and asks the app for native things
// (files in the data folder, windows, clipboard) with "host" messages.
import Cocoa
import WebKit

final class Core: NSObject, WKScriptMessageHandler {
  unowned let app: AppDelegate
  private var web: WKWebView!
  private var ready: (() -> Void)?
  private(set) var firstRun = false
  private var seq = 0
  private var waiting: [Int: (Bool, Any?) -> Void] = [:]

  init(app: AppDelegate) { self.app = app }

  func start(_ done: @escaping () -> Void) {
    ready = done
    let cfg = WKWebViewConfiguration()
    cfg.setURLSchemeHandler(AppScheme(), forURLScheme: "app")
    cfg.userContentController.add(self, name: "core")
    web = WKWebView(frame: .zero, configuration: cfg)
    if #available(macOS 13.3, *) { web.isInspectable = true }
    web.load(URLRequest(url: URL(string: "app://core/core.html")!))
  }

  /// Call a core channel. ctx: { window: id, incognito: bool, page: url? } (who is asking).
  func invoke(_ channel: String, _ args: Any, ctx: [String: Any], reply: @escaping (Bool, Any?) -> Void) {
    seq += 1
    waiting[seq] = reply
    run("__core.invoke(\(seq), \(json(channel)), \(json(args)), \(json(ctx)))")
  }

  fileprivate func run(_ js: String) { web.evaluateJavaScript(js, completionHandler: nil) }

  func userContentController(_ c: WKUserContentController, didReceive m: WKScriptMessage) {
    guard let msg = m.body as? [String: Any], let type = msg["type"] as? String else { return }
    switch type {
    case "log":
      print("[core] \(msg["text"] as? String ?? "")")
    case "ready":
      firstRun = msg["firstRun"] as? Bool ?? false
      ready?(); ready = nil
    case "reply":
      if let id = msg["id"] as? Int, let cb = waiting.removeValue(forKey: id) { cb(msg["ok"] as? Bool ?? false, msg["value"]) }
    case "emit":
      let channel = msg["channel"] as? String ?? "", args = msg["args"] as? [Any] ?? []
      if let w = msg["window"] as? Int { app.window(id: w)?.emit(channel, args) }
      else {
        // Like Electron's broadcast: every window, and our stupid:// pages.
        app.windows.forEach { $0.emit(channel, args); $0.tabs.emitToPages(channel, args) }
      }
    case "host":
      let id = msg["id"] as? Int ?? 0
      host(msg) { [weak self] ok, value in self?.run("__core.hostReply(\(id), \(ok), \(json(value)))") }
    default: break
    }
  }

  // Native things the core can't do itself.
  private func host(_ m: [String: Any], done: @escaping (Bool, Any?) -> Void) {
    let op = m["op"] as? String ?? ""
    switch op {
    case "read":
      guard let f = DataDir.file(m["name"] as? String ?? "") else { return done(false, "bad name") }
      done(true, try? String(contentsOf: f, encoding: .utf8))
    case "write":
      guard let f = DataDir.file(m["name"] as? String ?? ""), let text = m["text"] as? String else { return done(false, "bad name") }
      let tmp = f.appendingPathExtension("tmp")
      do { try text.write(to: tmp, atomically: false, encoding: .utf8); _ = try? FileManager.default.removeItem(at: f); try FileManager.default.moveItem(at: tmp, to: f); done(true, true) }
      catch { done(false, "\(error)") }
    case "remove":
      if let f = DataDir.file(m["name"] as? String ?? "") { try? FileManager.default.removeItem(at: f) }
      done(true, true)
    case "openWindow":
      app.openWindow(incognito: m["incognito"] as? Bool ?? false, urls: m["urls"] as? [String]); done(true, true)
    case "closeWindow":
      if let w = m["window"] as? Int { app.window(id: w)?.close() }; done(true, true)
    case "clipboard":
      NSPasteboard.general.clearContents(); NSPasteboard.general.setString(m["text"] as? String ?? "", forType: .string); done(true, true)
    case "openExternal":
      if let s = m["url"] as? String, let u = URL(string: s), ["http", "https", "mailto"].contains(u.scheme ?? "") { NSWorkspace.shared.open(u) }
      done(true, true)
    case "info":
      done(true, ["version": Foundation.Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0", "safari": safariVersion,
                  "dataDir": DataDir.url.path, "os": ProcessInfo.processInfo.operatingSystemVersionString, "home": NSHomeDirectory(), "profile": Profiles.current])
    case "quit": done(true, true); DispatchQueue.main.async { NSApp.terminate(nil) }
    case "settingsApplied": app.applySettings(m["settings"] as? [String: Any] ?? [:], changed: m["changed"] as? [String] ?? [], icon: m["appIconImage"] as? String); done(true, true)
    // passwords and API keys
    case "crypt":
      let text = m["text"] as? String ?? ""
      if m["act"] as? String == "enc" { do { done(true, try Vault.enc(text)) } catch { done(false, "Keychain: \(error.localizedDescription)") } }
      else { done(true, Vault.dec(text)) }
    // HTTP for Buddy
    case "fetch":
      let id = m["id"] as? Int ?? 0
      _ = NativeFetch(m, onChunk: { [weak self] t in self?.run("__core.hostChunk(\(id), \(json(t)))") }, done: done)
    case "fetchAbort": NativeFetch.live[m["fid"] as? String ?? ""]?.cancel(); done(true, true)
    // import
    case "files": let (ok, v) = ImportFiles.op(m); done(ok, v)
    case "sqlite": let (ok, v) = ImportFiles.sqlite(m); done(ok, v)
    case "plist": let (ok, v) = ImportFiles.plist(m); done(ok, v)
    case "openFile": Dialogs.openFile(m, done: done)
    case "chooseFolder": Dialogs.chooseFolder(m, done: done)
    case "openPrivacy": NSWorkspace.shared.open(URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles")!); done(true, true)
    // downloads
    case "download": app.downloads.op(m, done: done)
    // tabs, for Buddy and Rewind: only tabs of the window that asked
    case "tabInfo":
      guard let t = tabOf(m) else { return done(true, NSNull()) }
      done(true, ["url": t.web.url?.absoluteString ?? "", "title": t.web.title ?? ""])
    case "tabEval":
      guard let t = tabOf(m), let w = app.window(id: m["window"] as? Int ?? 0) else { return done(false, "no tab") }
      w.tabs.evalHelper(t, m["code"] as? String ?? "", done: done)
    case "tabShot": tabShot(m, done: done)
    case "rewindFiles": done(true, rewindFiles(m))
    // menus
    case "popupMenu":
      if let w = app.window(id: m["window"] as? Int ?? 0) { Menus.popup(w, items: m["items"] as? [[String: Any]] ?? [], x: m["x"] as? Double ?? 0, y: m["y"] as? Double ?? 0) }
      done(true, true)
    case "editMenu":
      if let w = app.window(id: m["window"] as? Int ?? 0) { Menus.editMenu(w, go: m["go"] as? Bool ?? false, hasSelection: m["hasSelection"] as? Bool ?? false) }
      done(true, true)
    // website data
    case "clearData": clearData(m, done: done)
    // profiles, default browser, branding, updates
    case "profiles": profiles(m, done: done)
    case "defaultBrowser":
      if m["act"] as? String == "set" { DefaultBrowser.set(done: done) } else { done(true, DefaultBrowser.status()) }
    case "brand":
      if m["act"] as? String == "apply" {
        do { try Brand.apply(name: m["name"] as? String ?? Brand.DEFAULT_NAME, iconDataUrl: m["icon"] as? String ?? ""); done(true, true) } catch { done(false, error.localizedDescription) }
      } else { done(true, Brand.status()) }
    case "update":
      if m["act"] as? String == "install" { let ok = app.updater.install(relaunch: true); done(true, ok); if ok { DispatchQueue.main.async { NSApp.terminate(nil) } } }
      else { app.updater.check(); done(true, true) }
    default:
      done(false, "unknown op \(op)")
    }
  }
}

extension Core {
  private func tabOf(_ m: [String: Any]) -> Tab? { app.window(id: m["window"] as? Int ?? 0)?.tabs.tabs[m["tab"] as? Int ?? 0] }

  /// A picture of a tab: base64 JPEG, or saved as a Rewind thumbnail (save: id).
  fileprivate func tabShot(_ m: [String: Any], done: @escaping (Bool, Any?) -> Void) {
    guard let t = tabOf(m) else { return done(false, "no tab") }
    let cfg = WKSnapshotConfiguration()
    let width = m["width"] as? Double ?? 1400
    if Double(t.web.bounds.width) > width { cfg.snapshotWidth = NSNumber(value: width) }
    t.web.takeSnapshot(with: cfg) { img, _ in
      guard let img, let tiff = img.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff),
            let jpg = rep.representation(using: .jpeg, properties: [.compressionFactor: m["quality"] as? Double ?? 0.7]) else { return done(false, "no picture") }
      if let id = m["save"] as? String {
        guard id.range(of: #"^[a-z0-9]{6,20}$"#, options: .regularExpression) != nil else { return done(false, "bad id") }
        let dir = DataDir.url.appendingPathComponent("rewind")
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        done(true, (try? jpg.write(to: dir.appendingPathComponent(id + ".jpg"))) != nil)
      } else { done(true, jpg.base64EncodedString()) }
    }
  }
  fileprivate func rewindFiles(_ m: [String: Any]) -> Any {
    let dir = DataDir.url.appendingPathComponent("rewind")
    switch m["act"] as? String ?? "" {
    case "delete":
      for id in m["ids"] as? [String] ?? [] where id.range(of: #"^[a-z0-9]{6,20}$"#, options: .regularExpression) != nil {
        try? FileManager.default.removeItem(at: dir.appendingPathComponent(id + ".jpg"))
      }
      return true
    case "clear": try? FileManager.default.removeItem(at: dir); return true
    case "size":
      let files = (try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: [.fileSizeKey])) ?? []
      return files.reduce(0) { $0 + ((try? $1.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0) }
    default: return false
    }
  }
  /// Cookies / site data / cache, for one site (site:clearData) or everything (privacy:clear).
  fileprivate func clearData(_ m: [String: Any], done: @escaping (Bool, Any?) -> Void) {
    if let origin = m["origin"] as? String, !origin.isEmpty {
      let store = (m["incognito"] as? Bool == true ? app.window(id: m["window"] as? Int ?? 0)?.tabs.privateStore : nil) ?? app.profileStore
      let host = URL(string: origin)?.host ?? ""
      store.fetchDataRecords(ofTypes: WKWebsiteDataStore.allWebsiteDataTypes()) { records in
        let mine = records.filter { host == $0.displayName || host.hasSuffix("." + $0.displayName) }
        store.removeData(ofTypes: WKWebsiteDataStore.allWebsiteDataTypes(), for: mine) { done(true, true) }
      }
      return
    }
    var types = Set<String>()
    if m["cookies"] as? Bool == true {
      types.formUnion([WKWebsiteDataTypeCookies, WKWebsiteDataTypeLocalStorage, WKWebsiteDataTypeSessionStorage, WKWebsiteDataTypeIndexedDBDatabases,
                       WKWebsiteDataTypeWebSQLDatabases, WKWebsiteDataTypeServiceWorkerRegistrations, WKWebsiteDataTypeFetchCache])
      if #available(macOS 14.0, *) { types.insert(WKWebsiteDataTypeFileSystem) }
    }
    if m["cache"] as? Bool == true { types.formUnion([WKWebsiteDataTypeDiskCache, WKWebsiteDataTypeMemoryCache, WKWebsiteDataTypeOfflineWebApplicationCache]) }
    app.profileStore.removeData(ofTypes: types, modifiedSince: .distantPast) { done(true, true) }
  }
  fileprivate func profiles(_ m: [String: Any], done: @escaping (Bool, Any?) -> Void) {
    switch m["act"] as? String ?? "" {
    case "list": done(true, ["current": Profiles.current, "list": Profiles.list()])
    case "sync": Profiles.sync(name: m["name"] as? String ?? "", color: m["color"] as? String ?? "", email: m["email"] as? String ?? ""); done(true, true)
    case "picker": done(true, ["on": Profiles.pickerEnabled(), "count": Profiles.list().count])
    case "setPicker": done(true, Profiles.setPicker(m["on"] as? Bool ?? true))
    case "open": done(true, Profiles.open(m["id"] as? String ?? ""))
    case "create": done(true, Profiles.create(name: m["name"] as? String ?? "", color: m["color"] as? String ?? "") as Any? ?? NSNull())
    case "remove": done(true, Profiles.remove(m["id"] as? String ?? ""))
    default: done(false, "unknown")
    }
  }
}

func json(_ v: Any?) -> String {
  guard let v = v, !(v is NSNull) else { return "null" }
  if let s = v as? String { return (try? String(data: JSONSerialization.data(withJSONObject: [s]), encoding: .utf8)).map { String($0.dropFirst().dropLast()) } ?? "null" }
  if JSONSerialization.isValidJSONObject(v), let d = try? JSONSerialization.data(withJSONObject: v), let s = String(data: d, encoding: .utf8) { return s }
  if let b = v as? Bool { return b ? "true" : "false" }
  if let n = v as? NSNumber { return n.stringValue }
  return "null"
}
