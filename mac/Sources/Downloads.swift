// Downloads with WKDownload: saved to Settings → download folder (or asked, with "Ask where to save"),
// progress reported to the core (downloads.json, the UI's download button and stupid://downloads), with
// pause/resume/cancel/retry like the Electron app. Files get macOS's quarantine flag like any browser download.
import Cocoa
import WebKit

final class DownloadManager: NSObject, WKDownloadDelegate {
  unowned let app: AppDelegate
  private final class Item {
    let id: String
    var download: WKDownload?
    let windowId: Int
    let incognito: Bool
    var url = ""
    var path = ""
    var resumeData: Data?
    var userCancelled = false, pausing = false
    var observers: [NSKeyValueObservation] = []
    var lastSent = Date.distantPast
    init(id: String, download: WKDownload, windowId: Int, incognito: Bool) { self.id = id; self.download = download; self.windowId = windowId; self.incognito = incognito }
  }
  private var items: [String: Item] = [:]
  private var seq = 0
  /// Starts downloads that don't come from a page (retry), and resumes paused ones.
  private lazy var helper = WKWebView(frame: .zero, configuration: { let c = WKWebViewConfiguration(); c.websiteDataStore = app.profileStore; return c }())

  init(app: AppDelegate) { self.app = app }

  private func item(_ d: WKDownload) -> Item? { items.values.first { $0.download === d } }
  private func ctx(_ it: Item) -> [String: Any] { ["window": it.windowId, "incognito": it.incognito] }
  private func report(_ it: Item, _ patch: [String: Any]) {
    app.core.invoke("dl:event", [["kind": "update", "id": it.id, "patch": patch]], ctx: ctx(it)) { _, _ in }
  }

  func adopt(_ d: WKDownload, window: BrowserWindow?) {
    seq += 1
    let it = Item(id: "\(String(Int(Date().timeIntervalSince1970 * 1000), radix: 36))-\(seq)", download: d, windowId: window?.id ?? 0, incognito: window?.incognito ?? false)
    it.url = d.originalRequest?.url?.absoluteString ?? ""
    items[it.id] = it
    d.delegate = self
  }
  /// "Save link as…", "Save image as…", "Save page as…" from a tab (keeps the tab's cookies).
  func start(_ url: URL, from web: WKWebView, window: BrowserWindow) {
    web.startDownload(using: URLRequest(url: url)) { [weak self] d in self?.adopt(d, window: window) }
  }

  func download(_ d: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
    guard let it = item(d) else { return completionHandler(nil) }
    let name = suggestedFilename.isEmpty ? "download" : suggestedFilename.replacingOccurrences(of: "/", with: "-")
    let begin = { [weak self] (dest: URL?) in
      guard let self, let dest else { completionHandler(nil); return }
      it.path = dest.path
      completionHandler(dest)
      self.app.core.invoke("dl:event", [["kind": "start", "rec": ["id": it.id, "filename": dest.lastPathComponent, "url": it.url, "savePath": dest.path,
                                                                   "total": max(0, response.expectedContentLength)]]], ctx: self.ctx(it)) { _, _ in }
      it.observers = [d.progress.observe(\.completedUnitCount) { [weak self] p, _ in
        guard let self, Date().timeIntervalSince(it.lastSent) > 0.25 else { return }
        it.lastSent = Date()
        DispatchQueue.main.async { self.report(it, ["state": "progressing", "received": p.completedUnitCount, "total": max(0, p.totalUnitCount), "paused": false]) }
      }]
    }
    if app.settings["askWhereToSave"] as? Bool == true {
      let panel = NSSavePanel(); panel.nameFieldStringValue = name
      panel.directoryURL = URL(fileURLWithPath: downloadDir())
      if let w = app.window(id: it.windowId)?.window { panel.beginSheetModal(for: w) { begin($0 == .OK ? panel.url : nil) } }
      else { begin(panel.runModal() == .OK ? panel.url : nil) }
    } else {
      begin(uniquePath(downloadDir(), name))
    }
  }
  private func downloadDir() -> String {
    let fallback = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask)[0].path
    let dir = (app.settings["downloadDir"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? fallback
    do { try FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true); return dir } catch { return fallback }
  }
  private func uniquePath(_ dir: String, _ name: String) -> URL {
    let base = (name as NSString).deletingPathExtension, ext = (name as NSString).pathExtension
    var u = URL(fileURLWithPath: dir).appendingPathComponent(name), i = 1
    while FileManager.default.fileExists(atPath: u.path) { u = URL(fileURLWithPath: dir).appendingPathComponent(ext.isEmpty ? "\(base) (\(i))" : "\(base) (\(i)).\(ext)"); i += 1 }
    return u
  }

  func downloadDidFinish(_ d: WKDownload) {
    guard let it = item(d) else { return }
    quarantine(it)
    let got = d.progress.completedUnitCount
    it.observers = []; it.download = nil
    report(it, ["state": "completed", "received": got, "total": max(got, d.progress.totalUnitCount)])
    items.removeValue(forKey: it.id)
  }
  func download(_ d: WKDownload, didFailWithError error: Error, resumeData: Data?) {
    if let it = item(d) { stopped(it, d, resumeData) }
  }
  /// Failed, cancelled or paused (a pause is a cancel that keeps the data to resume from).
  private func stopped(_ it: Item, _ d: WKDownload, _ resumeData: Data?) {
    guard it.download === d else { return }   // already handled
    it.observers = []; it.download = nil
    if it.pausing { it.pausing = false; it.resumeData = resumeData; report(it, ["state": "progressing", "paused": true]); return }
    report(it, ["state": it.userCancelled ? "cancelled" : "interrupted", "received": d.progress.completedUnitCount])
    items.removeValue(forKey: it.id)
  }
  private func quarantine(_ it: Item) {
    var url = URL(fileURLWithPath: it.path)
    var rv = URLResourceValues()
    var props: [String: Any] = [kLSQuarantineAgentNameKey as String: "The Stupid Browser", kLSQuarantineTypeKey as String: kLSQuarantineTypeWebDownload as String]
    if let u = URL(string: it.url), u.scheme?.hasPrefix("http") == true { props[kLSQuarantineDataURLKey as String] = u }
    rv.quarantineProperties = props
    try? url.setResourceValues(rv)
  }

  /// downloads:action from the core.
  func op(_ m: [String: Any], done: @escaping (Bool, Any?) -> Void) {
    let op = m["act"] as? String ?? ""
    switch op {
    case "open":
      guard let p = m["path"] as? String, FileManager.default.fileExists(atPath: p) else { return done(true, false) }
      done(true, NSWorkspace.shared.open(URL(fileURLWithPath: p)))
    case "show":
      if let p = m["path"] as? String { NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: p)]) }
      done(true, true)
    case "start":
      guard let s = m["url"] as? String, let u = URL(string: s), u.scheme?.hasPrefix("http") == true else { return done(true, false) }
      let win = (NSApp.keyWindow?.windowController as? BrowserWindow) ?? app.windows.first
      helper.startDownload(using: URLRequest(url: u)) { [weak self] d in self?.adopt(d, window: win) }
      done(true, true)
    case "cancel", "pause", "resume":
      guard let it = items[m["id"] as? String ?? ""] else { return done(true, false) }
      if op == "resume" {
        guard let data = it.resumeData else { return done(true, false) }
        it.resumeData = nil
        helper.resumeDownload(fromResumeData: data) { [weak self] d in
          it.download = d; d.delegate = self
          it.observers = [d.progress.observe(\.completedUnitCount) { [weak self] p, _ in
            guard let self, Date().timeIntervalSince(it.lastSent) > 0.25 else { return }
            it.lastSent = Date()
            DispatchQueue.main.async { self.report(it, ["state": "progressing", "received": p.completedUnitCount, "total": max(0, p.totalUnitCount), "paused": false]) }
          }]
          self?.report(it, ["paused": false])
        }
      } else if let d = it.download {
        if op == "pause" { it.pausing = true } else { it.userCancelled = true }
        d.cancel { [weak self] data in DispatchQueue.main.async { self?.stopped(it, d, data) } }
      } else if op == "cancel" {   // cancelling a paused download
        it.resumeData = nil; report(it, ["state": "cancelled", "paused": false]); items.removeValue(forKey: it.id)
      }
      done(true, true)
    default: done(false, "unknown op")
    }
  }
}
