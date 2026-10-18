// Menus: a web page's right-click menu with the Electron version's items (src/main.js pageContextMenu),
// the address bar's edit menu with "Paste and go", and menus the UI asks for (bookmark folders).
import Cocoa
import WebKit

/// A menu item that runs a closure.
final class ActionItem: NSMenuItem {
  private let run: () -> Void
  init(_ title: String, enabled: Bool = true, _ run: @escaping () -> Void) {
    self.run = run
    super.init(title: title, action: #selector(fire), keyEquivalent: "")
    target = self
    isEnabled = enabled
  }
  required init(coder: NSCoder) { fatalError() }
  @objc private func fire() { run() }
}

extension TabHost {
  /// Replaces WebKit's own menu with the Electron version's, keeping WebKit's for text fields
  /// (spelling suggestions, cut/copy/paste) and its Inspect Element item.
  func pageMenu(_ menu: NSMenu, for web: TabWebView) {
    guard let t = tab(for: web), Date().timeIntervalSince(t.ctxTime) < 2 else { return }   // no info: keep WebKit's menu
    let info = t.ctxInfo
    t.ctxTime = .distantPast
    if info["editable"] as? Bool == true { return }
    let native = { (id: String) in menu.items.first { $0.identifier?.rawValue == id } }
    let inspect = native("WKMenuItemIdentifierInspectElement")
    let copyImage = native("WKMenuItemIdentifierCopyImage")
    let s = owner.app.settings
    let link = info["link"] as? String ?? "", src = info["src"] as? String ?? "", media = info["media"] as? String ?? "none"
    let sel = (info["selection"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    let openUrl = { [weak self] (url: String, where_: String) in self?.owner.emit("open-url", [["url": url, "where": where_]]) }
    let copy = { (text: String) in NSPasteboard.general.clearContents(); NSPasteboard.general.setString(text, forType: .string) }
    let save = { [weak self] (url: String) in
      guard let self, let u = URL(string: url) else { return }
      self.owner.app.downloads.start(u, from: web, window: self.owner)
    }
    var items: [NSMenuItem] = []
    let sep = { if let last = items.last, !last.isSeparatorItem { items.append(.separator()) } }

    if link.range(of: #"^(https?|stupid):"#, options: .regularExpression) != nil {
      items.append(ActionItem("Open link in new tab") { openUrl(link, "background") })
      items.append(ActionItem("Open link in new window") { [weak self] in self?.owner.app.openWindow(incognito: false, urls: [link]) })
      items.append(ActionItem("Open link in private window") { [weak self] in self?.owner.app.openWindow(incognito: true, urls: [link]) })
      items.append(ActionItem("Save link as…") { save(link) })
      items.append(ActionItem("Copy link address") { copy(link) })
      sep()
    }
    if media == "image", !src.isEmpty {
      items.append(ActionItem("Open image in new tab") { openUrl(src, "background") })
      items.append(ActionItem("Save image as…") { save(src) })
      if let c = copyImage { menu.removeItem(c); c.title = "Copy image"; items.append(c) }
      items.append(ActionItem("Copy image address") { copy(src) })
      sep()
    }
    if media == "video" || media == "audio", !src.isEmpty, !src.hasPrefix("blob:") {
      items.append(ActionItem("Save \(media) as…") { save(src) })
      items.append(ActionItem("Copy \(media) address") { copy(src) })
      sep()
    }
    if !sel.isEmpty {
      items.append(ActionItem("Copy") { copy(sel) })
      let short = sel.count > 28 ? String(sel.prefix(28)) + "…" : sel
      let engine = s["engineName"] as? String ?? "the web", searchUrl = s["searchUrl"] as? String ?? "https://duckduckgo.com/?q=%s"
      items.append(ActionItem("Search \(engine) for “\(short)”") {
        openUrl(searchUrl.replacingOccurrences(of: "%s", with: sel.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? ""), "foreground")
      })
      items.append(ActionItem("Ask AI about this") { [weak self] in copy(sel); self?.owner.emit("shortcut", ["open-ai"]) })
      sep()
    }
    if link.isEmpty && sel.isEmpty && media == "none" {
      items.append(ActionItem("Back", enabled: web.canGoBack) { web.goBack() })
      items.append(ActionItem("Forward", enabled: web.canGoForward) { web.goForward() })
      items.append(ActionItem("Reload") { web.reload() })
      sep()
      items.append(ActionItem("Save page as…") { if let u = web.url { save(u.absoluteString) } })
      items.append(ActionItem("Print…") { [weak self] in self?.owner.emit("shortcut", ["print"]) })
      items.append(ActionItem("View page source") { [weak self] in self?.owner.emit("shortcut", ["view-source"]) })
      sep()
    }
    if let i = inspect { menu.removeItem(i); i.title = "Inspect"; items.append(i) }
    else { items.append(ActionItem("Inspect") { [weak self] in self?.showInspector(web) }) }
    menu.removeAllItems()
    items.forEach(menu.addItem)
  }
}

enum Menus {
  /// The address bar's menu (Electron's shellEditMenu): the usual edit items plus "Paste and go".
  static func editMenu(_ w: BrowserWindow, go: Bool, hasSelection: Bool) {
    let clip = (NSPasteboard.general.string(forType: .string) ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    let m = NSMenu()
    m.autoenablesItems = false
    func std(_ title: String, _ sel: String, _ on: Bool) { let it = NSMenuItem(title: title, action: Selector((sel)), keyEquivalent: ""); it.isEnabled = on; m.addItem(it) }
    std("Undo", "undo:", true); std("Redo", "redo:", true); m.addItem(.separator())
    std("Cut", "cut:", hasSelection); std("Copy", "copy:", hasSelection); std("Paste", "paste:", !clip.isEmpty)
    if go { m.addItem(ActionItem("Paste and go", enabled: !clip.isEmpty) { [weak w] in w?.emit("paste-go", [String(clip.prefix(4000))]) }) }
    m.addItem(.separator()); std("Select all", "selectAll:", true)
    show(m, in: w, at: nil)
  }
  /// A menu described by the core: [{ label, enabled?, submenu?, emit?: [channel, payload] }].
  static func popup(_ w: BrowserWindow, items: [[String: Any]], x: Double, y: Double) {
    show(build(items, w), in: w, at: NSPoint(x: x, y: y))
  }
  private static func build(_ items: [[String: Any]], _ w: BrowserWindow) -> NSMenu {
    let m = NSMenu(); m.autoenablesItems = false
    for d in items {
      let label = d["label"] as? String ?? ""
      if let sub = d["submenu"] as? [[String: Any]] {
        let it = NSMenuItem(title: label, action: nil, keyEquivalent: ""); it.submenu = build(sub, w); m.addItem(it)
      } else if let e = d["emit"] as? [Any], let ch = e.first as? String {
        m.addItem(ActionItem(label, enabled: d["enabled"] as? Bool ?? true) { [weak w] in w?.emit(ch, Array(e.dropFirst())) })
      } else {
        let it = NSMenuItem(title: label, action: nil, keyEquivalent: ""); it.isEnabled = d["enabled"] as? Bool ?? false; m.addItem(it)
      }
    }
    return m
  }
  /// Pops up at a point in the window's UI (top-left origin), or at the mouse.
  private static func show(_ m: NSMenu, in w: BrowserWindow, at p: NSPoint?) {
    guard let view = w.shell else { return }
    let at = p ?? view.convert(w.window?.mouseLocationOutsideOfEventStream ?? .zero, from: nil)
    m.popUp(positioning: nil, at: at, in: view)
  }
}
