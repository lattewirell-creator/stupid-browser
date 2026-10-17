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

  private func run(_ js: String) { web.evaluateJavaScript(js, completionHandler: nil) }

  func userContentController(_ c: WKUserContentController, didReceive m: WKScriptMessage) {
    guard let msg = m.body as? [String: Any], let type = msg["type"] as? String else { return }
    switch type {
    case "log":
      print("[core] \(msg["text"] as? String ?? "")")
    case "ready":
      ready?(); ready = nil
    case "reply":
      if let id = msg["id"] as? Int, let cb = waiting.removeValue(forKey: id) { cb(msg["ok"] as? Bool ?? false, msg["value"]) }
    case "emit":
      let channel = msg["channel"] as? String ?? "", args = msg["args"] as? [Any] ?? []
      if let w = msg["window"] as? Int { app.window(id: w)?.emit(channel, args) }
      else { app.windows.forEach { $0.emit(channel, args) } }
      if channel.hasPrefix("page:") || ["settings:changed", "bookmarks:changed", "widgets:changed", "background:changed", "downloads:started", "downloads:update", "downloads:removed", "downloads:cleared", "perms:changed", "passwords:changed", "rewind:changed", "update:status", "adblock:count", "bots:changed", "sidebar:changed"].contains(channel) {
        app.windows.forEach { $0.tabs.emitToPages(channel, args) }   // stupid:// pages listen too
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
                  "dataDir": DataDir.url.path, "os": ProcessInfo.processInfo.operatingSystemVersionString, "home": NSHomeDirectory()])
    default:
      done(false, "unknown op \(op)")
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
