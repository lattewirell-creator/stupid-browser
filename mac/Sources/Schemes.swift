// URL schemes: app:// serves the bundled UI and core; stupid:// serves our pages (new tab, settings…)
// exactly like the Electron app's protocol handler (src/main.js protocol.handle('stupid')).
import Foundation
import WebKit
import UniformTypeIdentifiers

let INTERNAL_PAGES: Set<String> = ["newtab", "settings", "history", "downloads", "bookmarks", "source", "welcome", "rewind"]

func mimeType(_ url: URL) -> String {
  switch url.pathExtension.lowercased() {
  case "html": return "text/html"
  case "js", "mjs": return "text/javascript"
  case "css": return "text/css"
  case "json": return "application/json"
  case "svg": return "image/svg+xml"
  case "woff2": return "font/woff2"
  case "ttf": return "font/ttf"
  default: return UTType(filenameExtension: url.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
  }
}

/// Serves a file under `base`, refusing anything that would escape it.
func serve(_ task: WKURLSchemeTask, base: URL, rel: String) {
  let target = base.appendingPathComponent(rel).standardizedFileURL
  guard target.path.hasPrefix(base.standardizedFileURL.path + "/"), let data = try? Data(contentsOf: target) else {
    let r = HTTPURLResponse(url: task.request.url!, statusCode: 404, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "text/plain"])!
    task.didReceive(r); task.didReceive(Data("Not found".utf8)); task.didFinish(); return
  }
  let r = HTTPURLResponse(url: task.request.url!, statusCode: 200, httpVersion: "HTTP/1.1",
                          headerFields: ["Content-Type": mimeType(target), "Content-Length": "\(data.count)", "Cache-Control": "no-cache"])!
  task.didReceive(r); task.didReceive(data); task.didFinish()
}

/// app://shell/… → src/…, app://core/… → mac/core/…, app://mac/… → mac/…
final class AppScheme: NSObject, WKURLSchemeHandler {
  func webView(_ w: WKWebView, start task: WKURLSchemeTask) {
    guard let url = task.request.url, let host = url.host else { return }
    let rel = url.path.isEmpty || url.path == "/" ? "index.html" : String(url.path.dropFirst())
    switch host {
    case "shell": serve(task, base: Res.src, rel: rel)
    case "core": serve(task, base: Res.mac.appendingPathComponent("core"), rel: rel)
    case "mac": serve(task, base: Res.mac, rel: rel)
    default: serve(task, base: Res.src, rel: "\u{0}")
    }
  }
  func webView(_ w: WKWebView, stop task: WKURLSchemeTask) {}
}

/// stupid://<page>/ → src/pages/<page>.html; stupid://<page>/fonts|assets/… → src/…; other files from src/pages.
/// Rewind thumbnails (stupid://rewind/thumbs/<id>.jpg) come from the data folder.
final class StupidScheme: NSObject, WKURLSchemeHandler {
  func webView(_ w: WKWebView, start task: WKURLSchemeTask) {
    guard let url = task.request.url, let host = url.host, INTERNAL_PAGES.contains(host) else {
      serve(task, base: Res.src, rel: "\u{0}"); return
    }
    var rel = url.path.removingPercentEncoding ?? url.path
    if host == "rewind", rel.hasPrefix("/thumbs/"), rel.range(of: #"^/thumbs/[a-z0-9]{6,20}\.jpg$"#, options: .regularExpression) != nil {
      serve(task, base: DataDir.url.appendingPathComponent("rewind"), rel: String(rel.dropFirst("/thumbs/".count))); return
    }
    if rel == "/" || rel.isEmpty { rel = "/\(host).html" }
    let base = rel.hasPrefix("/fonts/") || rel.hasPrefix("/assets/") ? Res.src : Res.src.appendingPathComponent("pages")
    serve(task, base: base, rel: String(rel.dropFirst()))
  }
  func webView(_ w: WKWebView, stop task: WKURLSchemeTask) {}
}

/// ~/Library/Application Support/The Stupid Browser WebKit (its own folder, so it never touches the Electron app's data).
enum DataDir {
  static let url: URL = {
    let u = ProcessInfo.processInfo.environment["STUPID_DATA_DIR"].map { URL(fileURLWithPath: $0) }   // tests
      ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("The Stupid Browser WebKit")
    try? FileManager.default.createDirectory(at: u, withIntermediateDirectories: true)
    return u
  }()
  static func file(_ name: String) -> URL? {
    guard name.range(of: #"^[a-zA-Z0-9._-]{1,80}$"#, options: .regularExpression) != nil else { return nil }
    return url.appendingPathComponent(name)
  }
}
