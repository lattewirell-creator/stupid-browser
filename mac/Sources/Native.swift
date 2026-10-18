// Native helpers the core asks for (host ops): encryption with a key in the macOS Keychain, HTTP requests
// (streamed, no CORS limits), reading other browsers' files for import, and file dialogs.
import Cocoa
import CryptoKit
import CommonCrypto
import SQLite3
import UniformTypeIdentifiers

/// Passwords and API keys are encrypted with AES-GCM; the key lives in the login Keychain.
/// "k:" values are ours, "p:" are plain base64 (no Keychain available), "e:" come from the Electron
/// version (Chromium's safeStorage) and are read once, then re-saved by the core as "k:".
enum Vault {
  static let service = "The Stupid Browser WebKit"
  static let account = "Data key"
  private static var cached: SymmetricKey?

  static func key() throws -> SymmetricKey {
    if let k = cached { return k }
    // Tests (STUPID_DATA_DIR) keep a throwaway key in their own folder and never touch the Keychain.
    if ProcessInfo.processInfo.environment["STUPID_DATA_DIR"] != nil {
      let f = Profiles.base.appendingPathComponent("test-vault.key")
      if let d = try? Data(contentsOf: f), d.count == 32 { cached = SymmetricKey(data: d); return cached! }
      let k = SymmetricKey(size: .bits256); try k.withUnsafeBytes { try Data($0).write(to: f) }
      cached = k; return k
    }
    let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account,
                                kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
    var out: CFTypeRef?
    let st = SecItemCopyMatching(query as CFDictionary, &out)
    if st == errSecSuccess, let d = out as? Data, d.count == 32 { cached = SymmetricKey(data: d); return cached! }
    guard st == errSecItemNotFound else { throw NSError(domain: "Keychain", code: Int(st)) }
    let k = SymmetricKey(size: .bits256)
    let add: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account,
                              kSecAttrLabel as String: "The Stupid Browser (passwords key)", kSecValueData as String: k.withUnsafeBytes { Data($0) }]
    let added = SecItemAdd(add as CFDictionary, nil)
    guard added == errSecSuccess else { throw NSError(domain: "Keychain", code: Int(added)) }
    cached = k
    return k
  }
  static func enc(_ s: String) throws -> String {
    guard let box = try AES.GCM.seal(Data(s.utf8), using: key()).combined else { throw NSError(domain: "Vault", code: 1) }
    return "k:" + box.base64EncodedString()
  }
  static func dec(_ s: String) -> String {
    if s.hasPrefix("k:"), let d = Data(base64Encoded: String(s.dropFirst(2))), let k = try? key(),
       let box = try? AES.GCM.SealedBox(combined: d), let plain = try? AES.GCM.open(box, using: k) { return String(decoding: plain, as: UTF8.self) }
    if s.hasPrefix("p:"), let d = Data(base64Encoded: String(s.dropFirst(2))) { return String(decoding: d, as: UTF8.self) }
    if s.hasPrefix("e:"), let d = Data(base64Encoded: String(s.dropFirst(2))) { return electronDecrypt(d) ?? "" }
    return ""
  }

  /// Chromium/Electron safeStorage on macOS: "v10" + AES-128-CBC, key = PBKDF2-SHA1(Keychain password, "saltysalt", 1003), IV = 16 spaces.
  private static var electronKey: [UInt8]??
  private static func electronDecrypt(_ data: Data) -> String? {
    guard data.count > 3, data.prefix(3) == Data("v10".utf8) else { return nil }
    if electronKey == nil {
      let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "The Stupid Browser Safe Storage",
                              kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
      var out: CFTypeRef?
      if SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let pw = out as? Data {
        var derived = [UInt8](repeating: 0, count: 16)
        let salt = Array("saltysalt".utf8)
        let ok = pw.withUnsafeBytes { p in
          CCKeyDerivationPBKDF(CCPBKDFAlgorithm(kCCPBKDF2), p.bindMemory(to: Int8.self).baseAddress, pw.count, salt, salt.count,
                               CCPseudoRandomAlgorithm(kCCPRFHmacAlgSHA1), 1003, &derived, derived.count)
        }
        electronKey = ok == kCCSuccess ? derived : nil
      } else { electronKey = .some(nil) }
    }
    guard let k = electronKey ?? nil else { return nil }
    let cipher = [UInt8](data.dropFirst(3))
    var out = [UInt8](repeating: 0, count: cipher.count + kCCBlockSizeAES128)
    var moved = 0
    let iv = [UInt8](repeating: 0x20, count: 16)
    let st = CCCrypt(CCOperation(kCCDecrypt), CCAlgorithm(kCCAlgorithmAES), CCOptions(kCCOptionPKCS7Padding), k, k.count, iv, cipher, cipher.count, &out, out.count, &moved)
    return st == kCCSuccess ? String(decoding: out.prefix(moved), as: UTF8.self) : nil
  }
}

/// One HTTP request for the core. Streams text as it arrives when asked (Buddy's answers).
final class NativeFetch: NSObject, URLSessionDataDelegate {
  static var live: [String: NativeFetch] = [:]
  private static let session: URLSession = {
    let c = URLSessionConfiguration.ephemeral
    c.timeoutIntervalForRequest = 120
    return URLSession(configuration: c, delegate: Router.shared, delegateQueue: .main)
  }()
  /// URLSession keeps one delegate; this hands each task's events to its NativeFetch.
  final class Router: NSObject, URLSessionDataDelegate {
    static let shared = Router()
    var byTask: [Int: NativeFetch] = [:]
    func urlSession(_ s: URLSession, dataTask: URLSessionDataTask, didReceive r: URLResponse, completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
      byTask[dataTask.taskIdentifier]?.status = (r as? HTTPURLResponse)?.statusCode ?? 0; completionHandler(.allow)
    }
    func urlSession(_ s: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) { byTask[dataTask.taskIdentifier]?.received(data) }
    func urlSession(_ s: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) { byTask.removeValue(forKey: task.taskIdentifier)?.finished(error) }
  }

  let fid: String
  private let stream: Bool
  private let onChunk: (String) -> Void
  private let done: (Bool, Any?) -> Void
  private var status = 0
  private var pending: [UInt8] = []   // bytes of a character split across packets
  private var body = ""
  private var task: URLSessionDataTask?

  init(_ m: [String: Any], onChunk: @escaping (String) -> Void, done: @escaping (Bool, Any?) -> Void) {
    fid = m["fid"] as? String ?? UUID().uuidString
    stream = m["stream"] as? Bool ?? false
    self.onChunk = onChunk; self.done = done
    super.init()
    guard let s = m["url"] as? String, let url = URL(string: s), ["https", "http"].contains(url.scheme ?? "") else { done(false, "bad url"); return }
    var req = URLRequest(url: url)
    req.httpMethod = (m["method"] as? String ?? "GET").uppercased()
    for (k, v) in m["headers"] as? [String: String] ?? [:] { req.setValue(v, forHTTPHeaderField: k) }
    if let b = m["body"] as? String { req.httpBody = Data(b.utf8) }
    if let t = m["timeout"] as? Double, t > 0 { req.timeoutInterval = t } else { req.timeoutInterval = 300 }
    req.setValue(req.value(forHTTPHeaderField: "User-Agent") ?? "TheStupidBrowser/\(Bundle.main.infoDictionary?["CFBundleShortVersionString"] ?? "")", forHTTPHeaderField: "User-Agent")
    let t = Self.session.dataTask(with: req)
    task = t
    Router.shared.byTask[t.taskIdentifier] = self
    Self.live[fid] = self
    t.resume()
  }
  func cancel() { task?.cancel() }
  fileprivate func received(_ data: Data) {
    pending.append(contentsOf: data)
    // Decode everything up to the last complete UTF-8 character; keep a split one for the next packet.
    var cut = pending.count
    var i = pending.count - 1
    while i >= 0 && i >= pending.count - 4 && (pending[i] & 0xC0) == 0x80 { i -= 1 }
    if i >= 0 {
      let b = pending[i]
      let need = b >= 0xF0 ? 4 : b >= 0xE0 ? 3 : b >= 0xC0 ? 2 : 1
      if i + need > pending.count { cut = i }
    }
    guard cut > 0 else { return }
    let text = String(decoding: pending[0..<cut], as: UTF8.self)
    pending.removeFirst(cut)
    if body.utf8.count < 4_000_000 { body += text }
    if stream && !text.isEmpty { onChunk(text) }
  }
  fileprivate func finished(_ error: Error?) {
    Self.live.removeValue(forKey: fid)
    if !pending.isEmpty { let rest = String(decoding: pending, as: UTF8.self); body += rest; if stream { onChunk(rest) } }
    if let e = error { done(false, (e as NSError).code == NSURLErrorCancelled ? "aborted" : e.localizedDescription); return }
    done(true, ["status": status, "body": body])
  }
}

/// Reading other browsers' data for import: only inside the home folder, never writing to it.
enum ImportFiles {
  static func allowed(_ p: String) -> URL? {
    let u = URL(fileURLWithPath: p).standardizedFileURL.resolvingSymlinksInPath()
    return u.path.hasPrefix(NSHomeDirectory() + "/") ? u : nil
  }
  static func op(_ m: [String: Any]) -> (Bool, Any?) {
    guard let u = allowed(m["path"] as? String ?? "") else { return (false, "not allowed") }
    var isDir: ObjCBool = false
    let exists = FileManager.default.fileExists(atPath: u.path, isDirectory: &isDir)
    switch m["act"] as? String ?? "" {
    case "isFile": return (true, exists && !isDir.boolValue)
    case "list": return (true, (try? FileManager.default.contentsOfDirectory(atPath: u.path)) ?? [])
    case "read":
      guard exists, !isDir.boolValue, let d = try? Data(contentsOf: u), d.count < 100_000_000 else { return (true, NSNull()) }
      return (true, String(decoding: d, as: UTF8.self))
    case "canRead":
      if !exists { return (true, NSNull()) }
      if let h = try? FileHandle(forReadingFrom: u) { try? h.close(); return (true, true) }
      return (true, false)
    default: return (false, "unknown")
    }
  }
  /// Query a copy of an SQLite database (the other browser may have it open and locked).
  static func sqlite(_ m: [String: Any]) -> (Bool, Any?) {
    guard let src = allowed(m["path"] as? String ?? ""), FileManager.default.fileExists(atPath: src.path) else { return (false, "missing") }
    let dir = FileManager.default.temporaryDirectory.appendingPathComponent("stupid-import-\(UUID().uuidString)")
    defer { try? FileManager.default.removeItem(at: dir) }
    do {
      try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
      let dst = dir.appendingPathComponent("db.sqlite")
      try FileManager.default.copyItem(at: src, to: dst)
      for ext in ["-wal", "-journal"] where FileManager.default.fileExists(atPath: src.path + ext) {
        try? FileManager.default.copyItem(atPath: src.path + ext, toPath: dst.path + ext)
      }
      var db: OpaquePointer?
      guard sqlite3_open_v2(dst.path, &db, SQLITE_OPEN_READWRITE, nil) == SQLITE_OK else { sqlite3_close(db); return (false, "open failed") }
      defer { sqlite3_close(db) }
      var stmt: OpaquePointer?
      guard sqlite3_prepare_v2(db, m["sql"] as? String ?? "", -1, &stmt, nil) == SQLITE_OK else { return (false, String(cString: sqlite3_errmsg(db))) }
      defer { sqlite3_finalize(stmt) }
      let TRANSIENT = unsafeBitCast(-1, to: sqlite3_destructor_type.self)
      for (i, p) in (m["params"] as? [Any] ?? []).enumerated() {
        if let n = p as? NSNumber { sqlite3_bind_double(stmt, Int32(i + 1), n.doubleValue) }
        else if let s = p as? String { sqlite3_bind_text(stmt, Int32(i + 1), s, -1, TRANSIENT) }
      }
      var rows: [[String: Any]] = []
      while sqlite3_step(stmt) == SQLITE_ROW, rows.count < 50_000 {
        var row: [String: Any] = [:]
        for c in 0..<sqlite3_column_count(stmt) {
          let name = String(cString: sqlite3_column_name(stmt, c))
          switch sqlite3_column_type(stmt, c) {
          case SQLITE_INTEGER: row[name] = sqlite3_column_int64(stmt, c)
          case SQLITE_FLOAT: row[name] = sqlite3_column_double(stmt, c)
          case SQLITE_TEXT: row[name] = String(cString: sqlite3_column_text(stmt, c))
          default: row[name] = NSNull()
          }
        }
        rows.append(row)
      }
      return (true, rows)
    } catch { return (false, "\(error)") }
  }
  /// Binary plist → XML text (Safari's bookmarks), via plutil.
  static func plist(_ m: [String: Any]) -> (Bool, Any?) {
    guard let u = allowed(m["path"] as? String ?? "") else { return (false, "not allowed") }
    let p = Process(); p.executableURL = URL(fileURLWithPath: "/usr/bin/plutil"); p.arguments = ["-convert", "xml1", "-o", "-", u.path]
    let pipe = Pipe(); p.standardOutput = pipe; p.standardError = FileHandle.nullDevice
    do { try p.run() } catch { return (false, "plutil failed") }
    let data = pipe.fileHandleForReading.readDataToEndOfFile(); p.waitUntilExit()
    return p.terminationStatus == 0 ? (true, String(decoding: data, as: UTF8.self)) : (false, "plutil failed")
  }
}

enum Dialogs {
  static func sheetWindow() -> NSWindow? { NSApp.keyWindow ?? NSApp.mainWindow }
  /// Pick a file of the given types and read it as text: { name, text } or { error }; nil when cancelled.
  static func openFile(_ m: [String: Any], done: @escaping (Bool, Any?) -> Void) {
    let panel = NSOpenPanel()
    panel.title = m["title"] as? String ?? "Open"
    panel.prompt = m["button"] as? String ?? "Open"
    panel.allowedContentTypes = (m["exts"] as? [String] ?? []).compactMap { UTType(filenameExtension: $0) }
    panel.directoryURL = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask).first
    let max = m["max"] as? Double ?? 50e6
    let finish: (NSApplication.ModalResponse) -> Void = { r in
      guard r == .OK, let u = panel.url else { return done(true, NSNull()) }
      guard let d = try? Data(contentsOf: u), Double(d.count) < max else { return done(true, ["name": u.lastPathComponent, "error": "Couldn’t read that file."]) }
      done(true, ["name": u.lastPathComponent, "text": String(decoding: d, as: UTF8.self)])
    }
    if let w = sheetWindow() { panel.beginSheetModal(for: w, completionHandler: finish) } else { finish(panel.runModal()) }
  }
  static func chooseFolder(_ m: [String: Any], done: @escaping (Bool, Any?) -> Void) {
    let panel = NSOpenPanel()
    panel.canChooseDirectories = true; panel.canChooseFiles = false; panel.canCreateDirectories = true
    if let p = m["path"] as? String, !p.isEmpty { panel.directoryURL = URL(fileURLWithPath: p) }
    let finish: (NSApplication.ModalResponse) -> Void = { r in done(true, r == .OK ? panel.url?.path as Any? ?? NSNull() : NSNull()) }
    if let w = sheetWindow() { panel.beginSheetModal(for: w, completionHandler: finish) } else { finish(panel.runModal()) }
  }
}

/// Default browser (http/https handler). macOS asks the user to confirm the change.
enum DefaultBrowser {
  static func status() -> [String: Any] {
    let mine = Bundle.main.bundleURL.standardizedFileURL
    let check = { (s: String) -> Bool in NSWorkspace.shared.urlForApplication(toOpen: URL(string: "\(s)://example.com")!)?.standardizedFileURL == mine }
    return ["http": check("http"), "https": check("https")]
  }
  static func set(done: @escaping (Bool, Any?) -> Void) {
    guard #available(macOS 12.0, *) else { return done(true, false) }
    NSWorkspace.shared.setDefaultApplication(at: Bundle.main.bundleURL, toOpenURLsWithScheme: "http") { _ in
      NSWorkspace.shared.setDefaultApplication(at: Bundle.main.bundleURL, toOpenURLsWithScheme: "https") { _ in DispatchQueue.main.async { done(true, true) } }
    }
  }
}
