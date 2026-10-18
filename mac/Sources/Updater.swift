// Updates and branding for the Mac (WebKit) version.
// Updater (like src/mac-updater.js): checks GitHub Releases for StupidBrowser-<version>-mac.zip, verifies its
// SHA-512 against the release's latest-mac.yml, unpacks it next to the installed app and swaps the app when
// the browser quits (or on "Restart to update"). Works without an Apple Developer ID.
// Brand (like src/mac-brand.js): writes Settings → browser name / app icon into the app bundle.
import Cocoa
import CryptoKit

private let REPO = "lattewirell-creator/stupid-browser"
private let BUNDLE_ID = Bundle.main.bundleIdentifier ?? "com.emil.stupidbrowser.webkit"
private func q(_ s: String) -> String { "'" + s.replacingOccurrences(of: "'", with: "'\\''") + "'" }
private func run(_ cmd: String, _ args: [String]) -> String? {
  let p = Process(); p.executableURL = URL(fileURLWithPath: cmd); p.arguments = args
  let pipe = Pipe(); p.standardOutput = pipe; p.standardError = FileHandle.nullDevice
  do { try p.run() } catch { return nil }
  let out = pipe.fileHandleForReading.readDataToEndOfFile(); p.waitUntilExit()
  return p.terminationStatus == 0 ? String(decoding: out, as: UTF8.self).trimmingCharacters(in: .whitespacesAndNewlines) : nil
}
private func spawnAfterExit(_ lines: [String]) {
  let script = (["while kill -0 \(ProcessInfo.processInfo.processIdentifier) 2>/dev/null; do sleep 0.3; done"] + lines).joined(separator: "\n")
  let p = Process(); p.executableURL = URL(fileURLWithPath: "/bin/sh"); p.arguments = ["-c", script]
  p.standardOutput = FileHandle.nullDevice; p.standardError = FileHandle.nullDevice
  try? p.run()
}
private var appPath: String { Bundle.main.bundlePath }
/// Can the app be changed where it lives? Not from a disk image or App Translocation's read-only copy.
private func writable() -> Bool {
  appPath.hasSuffix(".app") && !appPath.contains("AppTranslocation") && !appPath.hasPrefix("/Volumes/")
    && FileManager.default.isWritableFile(atPath: (appPath as NSString).deletingLastPathComponent) && FileManager.default.isWritableFile(atPath: appPath)
}

enum Brand {
  static let DEFAULT_NAME = "The Stupid Browser"
  static func cleanName(_ n: String) -> String {
    var s = n.replacingOccurrences(of: #"[/:\\\u0000]"#, with: " ", options: .regularExpression)
    while s.first == "." || s.first == " " { s.removeFirst() }
    s = s.replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression).trimmingCharacters(in: .whitespaces)
    return s.isEmpty ? DEFAULT_NAME : String(s.prefix(40))
  }
  private static var keptIcon: URL { DataDir.url.appendingPathComponent("brand-icon.icns") }
  static func status() -> [String: Any] {
    guard writable() else { return ["supported": false] }
    let name = run("/usr/bin/plutil", ["-extract", "CFBundleDisplayName", "raw", "-o", "-", appPath + "/Contents/Info.plist"]) ?? DEFAULT_NAME
    return ["supported": true, "name": name, "custom": FileManager.default.fileExists(atPath: appPath + "/Contents/Resources/icon-default.icns") || name != DEFAULT_NAME, "path": appPath]
  }
  /// PNG data URL → .icns with every size macOS wants.
  private static func makeIcns(_ dataUrl: String) throws -> URL {
    guard let comma = dataUrl.firstIndex(of: ","), let data = Data(base64Encoded: String(dataUrl[dataUrl.index(after: comma)...])), let img = NSImage(data: data) else {
      throw NSError(domain: "Brand", code: 1, userInfo: [NSLocalizedDescriptionKey: "That logo image couldn’t be read"])
    }
    let work = FileManager.default.temporaryDirectory.appendingPathComponent("stupid-icon-\(UUID().uuidString)")
    let set = work.appendingPathComponent("icon.iconset")
    try FileManager.default.createDirectory(at: set, withIntermediateDirectories: true)
    for s in [16, 32, 128, 256, 512] {
      for (scale, suffix) in [(1, ""), (2, "@2x")] {
        let px = s * scale
        guard let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: px, pixelsHigh: px, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0) else { continue }
        NSGraphicsContext.saveGraphicsState(); NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
        NSGraphicsContext.current?.imageInterpolation = .high
        img.draw(in: NSRect(x: 0, y: 0, width: px, height: px)); NSGraphicsContext.restoreGraphicsState()
        try rep.representation(using: .png, properties: [:])?.write(to: set.appendingPathComponent("icon_\(s)x\(s)\(suffix).png"))
      }
    }
    let out = work.appendingPathComponent("icon.icns")
    guard run("/usr/bin/iconutil", ["-c", "icns", set.path, "-o", out.path]) != nil else { throw NSError(domain: "Brand", code: 2) }
    return out
  }
  /// Shell lines that brand the bundle at `target` (also used after an update swaps the bundle in).
  static func scriptLines(_ target: String, name: String, icns: String?) -> [String] {
    let plist = target + "/Contents/Info.plist", res = target + "/Contents/Resources"
    let finalPath = ((target as NSString).deletingLastPathComponent as NSString).appendingPathComponent(cleanName(name) + ".app")
    return [
      "/usr/bin/plutil -replace CFBundleDisplayName -string \(q(cleanName(name))) \(q(plist))",
      "[ -f \(q(res + "/icon-default.icns")) ] || cp \(q(res + "/AppIcon.icns")) \(q(res + "/icon-default.icns"))",
      icns.map { "cp \(q($0)) \(q(res + "/AppIcon.icns"))" } ?? "cp \(q(res + "/icon-default.icns")) \(q(res + "/AppIcon.icns"))",
      finalPath != target ? "if [ ! -e \(q(finalPath)) ]; then mv \(q(target)) \(q(finalPath)); fi" : ":",
      "T=\(q(finalPath)); [ -d \"$T\" ] || T=\(q(target))",
      "xattr -cr \"$T\" 2>/dev/null; /usr/bin/codesign --force --deep --sign - \"$T\" >/dev/null 2>&1",
      "touch \"$T\"",
      "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f \"$T\" >/dev/null 2>&1",
      "killall Dock 2>/dev/null; :",
    ]
  }
  /// Brand the running app: after it quits, edit the bundle and reopen it.
  static func apply(name: String, iconDataUrl: String) throws {
    guard writable() else { throw NSError(domain: "Brand", code: 3, userInfo: [NSLocalizedDescriptionKey: "Move The Stupid Browser into Applications first"]) }
    var icns: String? = nil
    try? FileManager.default.removeItem(at: keptIcon)
    if !iconDataUrl.isEmpty {
      let made = try makeIcns(iconDataUrl)
      try FileManager.default.copyItem(at: made, to: keptIcon)
      try? FileManager.default.removeItem(at: made.deletingLastPathComponent())
      icns = keptIcon.path
    }
    spawnAfterExit(scriptLines(appPath, name: name, icns: icns) + ["open \"$T\"" + Updater.relaunchArgs()])
  }
  /// For the updater: re-brand a freshly swapped-in bundle, or nothing if the app isn't branded.
  static func relabelAfterUpdate(_ target: String, settings: [String: Any]) -> [String] {
    guard settings["brandBundle"] as? Bool == true else { return [] }
    let name = (settings["wordmark"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? DEFAULT_NAME
    return scriptLines(target, name: name, icns: FileManager.default.fileExists(atPath: keptIcon.path) ? keptIcon.path : nil)
  }
}

final class Updater {
  unowned let app: AppDelegate
  private var staged: (version: String, app: String, stage: String)?
  private var busy = false
  private var timer: Timer?
  init(app: AppDelegate) { self.app = app }

  static func relaunchArgs() -> String {
    var a: [String] = []
    if Profiles.current != "default" { a.append("--profile=\(Profiles.current)") }
    return a.isEmpty ? "" : " --args " + a.map(q).joined(separator: " ")
  }
  private func push(_ patch: [String: Any]) { app.core.invoke("update:push", [patch], ctx: [:]) { _, _ in } }
  /// Is version a newer than b? 1.3.2-beta.1 is newer than 1.3.1 but older than 1.3.2.
  static func newer(_ a: String, _ b: String) -> Bool {
    func parse(_ v: String) -> ([Int], String) {
      let parts = v.split(separator: "-", maxSplits: 1).map(String.init)
      let n = parts[0].split(separator: ".").compactMap { Int($0) }
      return (n.count == 3 ? n : [0, 0, 0], parts.count > 1 ? parts[1] : "")
    }
    let x = parse(a), y = parse(b)
    for i in 0..<3 where x.0[i] != y.0[i] { return x.0[i] > y.0[i] }
    if x.1.isEmpty != y.1.isEmpty { return x.1.isEmpty }
    return x.1 > y.1
  }

  func start() {
    DispatchQueue.main.asyncAfter(deadline: .now() + 10) { [weak self] in self?.check() }
    timer = Timer.scheduledTimer(withTimeInterval: 4 * 3600, repeats: true) { [weak self] _ in self?.check() }
  }
  func check() {
    guard !busy, staged == nil else { return }
    guard writable() else { push(["status": "manual", "error": NSNull()]); return }
    busy = true
    push(["status": "checking", "error": NSNull()])
    Task { @MainActor in
      defer { busy = false }
      do {
        let rel = try await getJSON("https://api.github.com/repos/\(REPO)/releases/latest")
        let version = (rel["tag_name"] as? String ?? "").replacingOccurrences(of: "^v", with: "", options: .regularExpression)
        let current = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0.0.0"
        guard version.range(of: #"^\d+\.\d+\.\d+$"#, options: .regularExpression) != nil, Updater.newer(version, current) else { push(["status": "none", "lastCheck": now()]); return }
        let assets = rel["assets"] as? [[String: Any]] ?? []
        let asset = { (n: String) in assets.first { $0["name"] as? String == n } }
        let zipName = "StupidBrowser-\(version)-mac.zip"
        guard let zip = asset(zipName), let yml = asset("latest-mac.yml"), let zipUrl = zip["browser_download_url"] as? String, let ymlUrl = yml["browser_download_url"] as? String else {
          push(["status": "none", "lastCheck": now()]); return
        }
        guard let expected = Updater.shaFor(try await getText(ymlUrl), zipName) else { throw err("Update has no checksum") }
        push(["status": "downloading", "version": version, "progress": 0])
        let (file, sha) = try await download(zipUrl)
        guard sha == expected else { throw err("Downloaded update failed its integrity check") }
        let parent = (appPath as NSString).deletingLastPathComponent
        let stage = (parent as NSString).appendingPathComponent(".stupid-update-\(version)")
        try? FileManager.default.removeItem(atPath: stage)
        try FileManager.default.createDirectory(atPath: stage, withIntermediateDirectories: true)
        guard run("/usr/bin/ditto", ["-x", "-k", file.path, stage]) != nil else { throw err("Couldn’t unpack the update") }
        try? FileManager.default.removeItem(at: file)
        guard let name = (try? FileManager.default.contentsOfDirectory(atPath: stage))?.first(where: { $0.hasSuffix(".app") }) else { throw err("Update is missing the app") }
        let newApp = (stage as NSString).appendingPathComponent(name)
        let info = NSDictionary(contentsOfFile: newApp + "/Contents/Info.plist")
        guard info?["CFBundleIdentifier"] as? String == BUNDLE_ID, info?["CFBundleShortVersionString"] as? String == version else { throw err("Update is not The Stupid Browser \(version)") }
        staged = (version, newApp, stage)
        push(["status": "ready", "version": version, "progress": 100, "lastCheck": now()])
      } catch {
        push(["status": "error", "error": String(error.localizedDescription.prefix(200)), "lastCheck": now()])
      }
    }
  }
  private func now() -> Double { Date().timeIntervalSince1970 * 1000 }
  private func err(_ s: String) -> NSError { NSError(domain: "Updater", code: 1, userInfo: [NSLocalizedDescriptionKey: s]) }
  private func request(_ url: String) -> URLRequest {
    var r = URLRequest(url: URL(string: url)!); r.timeoutInterval = 20
    r.setValue("TheStupidBrowser-Updater", forHTTPHeaderField: "User-Agent"); r.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")
    return r
  }
  private func getJSON(_ url: String) async throws -> [String: Any] {
    let (d, r) = try await URLSession.shared.data(for: request(url))
    guard (r as? HTTPURLResponse)?.statusCode == 200 else { throw err("Update server answered \((r as? HTTPURLResponse)?.statusCode ?? 0)") }
    return (try JSONSerialization.jsonObject(with: d) as? [String: Any]) ?? [:]
  }
  private func getText(_ url: String) async throws -> String { String(decoding: try await URLSession.shared.data(for: request(url)).0, as: UTF8.self) }
  /// latest-mac.yml lists each file with its sha512 (base64).
  static func shaFor(_ yml: String, _ file: String) -> String? {
    let lines = yml.components(separatedBy: "\n")
    guard let i = lines.firstIndex(where: { $0.trimmingCharacters(in: .whitespaces) == "- url: \(file)" }) else { return nil }
    for l in lines[(i + 1)...] {
      let t = l.trimmingCharacters(in: .whitespaces)
      if t.hasPrefix("- url:") { break }
      if t.hasPrefix("sha512:") { return t.dropFirst(7).trimmingCharacters(in: .whitespaces) }
    }
    return nil
  }
  private func download(_ url: String) async throws -> (URL, String) {
    let (bytes, r) = try await URLSession.shared.bytes(for: request(url))
    guard (r as? HTTPURLResponse)?.statusCode == 200 else { throw err("Download failed") }
    let total = r.expectedContentLength
    let file = FileManager.default.temporaryDirectory.appendingPathComponent("stupid-update-\(UUID().uuidString).zip")
    FileManager.default.createFile(atPath: file.path, contents: nil)
    let out = try FileHandle(forWritingTo: file)
    defer { try? out.close() }
    var hash = SHA512(), buf = Data(), got: Int64 = 0, last = -1
    buf.reserveCapacity(1 << 20)
    for try await b in bytes {
      buf.append(b)
      if buf.count >= 1 << 20 {
        hash.update(data: buf); out.write(buf); got += Int64(buf.count); buf.removeAll(keepingCapacity: true)
        let pct = total > 0 ? Int(got * 100 / total) : 0
        if pct != last { last = pct; push(["status": "downloading", "progress": pct]) }
      }
    }
    hash.update(data: buf); out.write(buf)
    return (file, Data(hash.finalize()).base64EncodedString())
  }

  /// Swap the bundles after this process exits, then optionally reopen the new version.
  @discardableResult
  func install(relaunch: Bool) -> Bool {
    guard let s = staged else { return false }
    let bak = appPath + ".old"
    var lines = [
      "rm -rf \(q(bak))",
      "if mv \(q(appPath)) \(q(bak)); then",
      "  if mv \(q(s.app)) \(q(appPath)); then rm -rf \(q(bak)); else mv \(q(bak)) \(q(appPath)); fi",
      "fi",
      "rm -rf \(q(s.stage))",
      "xattr -dr com.apple.quarantine \(q(appPath)) 2>/dev/null",
    ]
    lines += Brand.relabelAfterUpdate(appPath, settings: app.settings)   // keep a custom app name / icon
    lines += ["[ -n \"$T\" ] || T=\(q(appPath))", relaunch ? "open \"$T\"" + Updater.relaunchArgs() : ":"]
    spawnAfterExit(lines)
    staged = nil
    return true
  }
  var ready: Bool { staged != nil }
}
