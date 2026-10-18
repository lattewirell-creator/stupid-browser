// Shield: blocks ads and trackers with a WebKit content blocker compiled from mac/adblock/rules.json
// (EasyList + EasyPrivacy, built by scripts/build-mac-blocklist.js). Compiled once and cached by WebKit;
// a new rules file (an update) gets a new identifier and is compiled again.
import Foundation
import WebKit

enum Blocker {
  private(set) static var list: WKContentRuleList?
  private static var count = 0, sent = 0
  private static var timer: Timer?
  static var onReady: (() -> Void)?

  static func load() {
    let file = Res.mac.appendingPathComponent("adblock/rules.json")
    guard let attrs = try? FileManager.default.attributesOfItem(atPath: file.path) else { print("[stupid] no ad blocker rules"); return }
    let stamp = "\((attrs[.size] as? Int) ?? 0)-\(Int(((attrs[.modificationDate] as? Date) ?? Date()).timeIntervalSince1970))"
    let id = "stupid-shield-\(stamp)"
    guard let store = WKContentRuleListStore.default() else { return }
    store.lookUpContentRuleList(forIdentifier: id) { found, _ in
      if let found { ready(found); return }
      DispatchQueue.global(qos: .utility).async {
        guard let text = try? String(contentsOf: file, encoding: .utf8) else { return }
        DispatchQueue.main.async {
          store.compileContentRuleList(forIdentifier: id, encodedContentRuleList: text) { compiled, err in
            if let err { print("[stupid] ad blocker failed to compile: \(err)"); return }
            ready(compiled)
            // Drop older compiled versions.
            store.getAvailableContentRuleListIdentifiers { ids in for old in ids ?? [] where old.hasPrefix("stupid-shield-") && old != id { store.removeContentRuleList(forIdentifier: old) { _ in } } }
          }
        }
      }
    }
  }
  private static func ready(_ l: WKContentRuleList?) { list = l; onReady?() }

  /// One blocked request: the count goes to the UI at most twice a second (like the Electron app).
  static func counted() {
    count += 1
    guard timer == nil else { return }
    timer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: false) { _ in
      timer = nil
      guard count != sent, let core = (NSApp.delegate as? AppDelegate)?.core else { return }
      sent = count
      core.invoke("ads:count", [count], ctx: [:]) { _, _ in }
    }
  }
}
