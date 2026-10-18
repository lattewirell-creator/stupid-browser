// The Stupid Browser for Mac (WebKit). Entry point: the core (browser logic, like Electron's main
// process) plus browser windows. The UI itself is the Electron app's src/ folder, bundled unchanged.
import Cocoa
import WebKit

/// Bundled web files: Resources/app/src (the Electron UI), Resources/app/mac (Mac-only JS).
enum Res {
  static let root = Bundle.main.resourceURL!.appendingPathComponent("app")
  static var src: URL { root.appendingPathComponent("src") }
  static var mac: URL { root.appendingPathComponent("mac") }
  static func text(_ url: URL) -> String { (try? String(contentsOf: url, encoding: .utf8)) ?? "" }
}

/// Safari's version, so pages see this browser the way Safari introduces itself (same engine).
let safariVersion: String = (NSDictionary(contentsOfFile: "/Applications/Safari.app/Contents/Info.plist")?["CFBundleShortVersionString"] as? String) ?? "26.0"

final class AppDelegate: NSObject, NSApplicationDelegate {
  var core: Core!
  var windows: [BrowserWindow] = []
  /// The settings the app itself uses (sent by the core whenever settings change; no big images).
  var settings: [String: Any] = [:]
  lazy var profileStore: WKWebsiteDataStore = Profiles.websiteStore()
  lazy var downloads = DownloadManager(app: self)
  lazy var updater = Updater(app: self)
  private var started = false
  private var pendingOpen: [String] = []
  private var picker: PickerWindow?

  func applicationWillFinishLaunching(_ n: Notification) {
    // Links and files from other apps (default browser): kept until the core is ready.
    NSAppleEventManager.shared().setEventHandler(self, andSelector: #selector(openURLEvent(_:reply:)), forEventClass: AEEventClass(kInternetEventClass), andEventID: AEEventID(kAEGetURL))
  }
  func applicationDidFinishLaunching(_ n: Notification) {
    let argUrls = CommandLine.arguments.dropFirst().filter { $0.range(of: #"^https?://"#, options: .regularExpression) != nil }
    pendingOpen += argUrls
    guard Profiles.takeLock(urls: pendingOpen) else { NSApp.terminate(nil); return }   // this profile is open in another copy
    Profiles.listen { [weak self] urls in self?.openFromOutside(urls) }
    buildMenu()
    Shortcuts.install(self)
    Blocker.onReady = { [weak self] in self?.windows.forEach { $0.tabs.setAdblock(self?.settings["adblock"] as? Bool ?? true) } }
    Blocker.load()
    core = Core(app: self)
    core.start { [weak self] in
      guard let self else { return }
      self.started = true
      let urls = self.pendingOpen; self.pendingOpen = []
      let showPicker = Profiles.current == "default" && urls.isEmpty && Profiles.list().count > 1 && Profiles.pickerEnabled()
        && ProcessInfo.processInfo.environment["STUPID_SNAPSHOT"] == nil && !self.core.firstRun
      if showPicker { self.picker = PickerWindow(app: self); self.picker?.showWindow(nil) } else { self.openStartupWindows(urls) }
      self.updater.start()
    }
  }

  /// Startup windows like the Electron app: the welcome screen on a first run, else the saved windows
  /// ("continue where you left off"), the startup pages, or a new tab.
  func openStartupWindows(_ urls: [String]) {
    core.invoke("app:startup", [urls], ctx: [:]) { [weak self] _, n in
      let count = max(1, (n as? Int) ?? 1)
      for _ in 0..<count { self?.openWindow(incognito: false, urls: nil, startup: true) }
    }
  }
  @discardableResult
  func openWindow(incognito: Bool, urls: [String]?, startup: Bool = false) -> BrowserWindow {
    let w = BrowserWindow(app: self, incognito: incognito, urls: urls, startup: startup)
    windows.append(w)
    w.showWindow(nil)
    if windows.count == 1 { w.selfTest() }
    return w
  }
  func windowClosed(_ w: BrowserWindow) { windows.removeAll { $0 === w } }
  func window(id: Int) -> BrowserWindow? { windows.first { $0.id == id } }
  func pickerClosed(chosen: Bool) { picker = nil; if !chosen && windows.isEmpty { /* Mac: stay in the Dock */ } }

  func applicationShouldTerminateAfterLastWindowClosed(_: NSApplication) -> Bool { false }
  func applicationShouldHandleReopen(_: NSApplication, hasVisibleWindows: Bool) -> Bool {
    // Dock click after closing every window: start fresh like a relaunch.
    if !hasVisibleWindows && started && windows.isEmpty { if let p = picker { p.showWindow(nil) } else { openStartupWindows([]) } }
    return true
  }
  func applicationWillTerminate(_ n: Notification) { if updater.ready { updater.install(relaunch: false) } }

  @objc func openURLEvent(_ e: NSAppleEventDescriptor, reply: NSAppleEventDescriptor) {
    if let s = e.paramDescriptor(forKeyword: keyDirectObject)?.stringValue, s.range(of: #"^https?:"#, options: [.regularExpression, .caseInsensitive]) != nil { openFromOutside([s]) }
  }
  func application(_ sender: NSApplication, openFiles files: [String]) {
    openFromOutside(files.map { URL(fileURLWithPath: $0).absoluteString }); sender.reply(toOpenOrPrint: .success)
  }
  /// A link from another app: a new tab in the most recent normal window (or a new window).
  func openFromOutside(_ urls: [String]) {
    guard started else { pendingOpen += urls; return }
    if let w = windows.last(where: { !$0.incognito }) {
      if w.window?.isMiniaturized == true { w.window?.deminiaturize(nil) }
      w.window?.makeKeyAndOrderFront(nil)
      if urls.isEmpty { w.emit("shortcut", ["new-tab"]) } else { urls.forEach { w.emit("open-url", [["url": $0, "where": "foreground"]]) } }
    } else if picker == nil {
      openStartupWindows(urls)
    }
    NSApp.activate(ignoringOtherApps: true)
  }

  /// Settings that change the app itself (the Electron main process' applySettingsSideEffects).
  func applySettings(_ s: [String: Any], changed: [String], icon: String?) {
    let first = settings.isEmpty
    settings = s
    if first || changed.contains("theme") {
      let t = s["theme"] as? String ?? "system"
      NSApp.appearance = t == "light" ? NSAppearance(named: .aqua) : t == "dark" ? NSAppearance(named: .darkAqua) : nil
    }
    if let icon {   // Settings → use my logo as the app icon (Dock)
      if !icon.isEmpty, let comma = icon.firstIndex(of: ","), let d = Data(base64Encoded: String(icon[icon.index(after: comma)...])), let img = NSImage(data: d) {
        NSApp.applicationIconImage = img
      } else { NSApp.applicationIconImage = nil }
    }
    if first || changed.contains("wordmark") { windows.forEach { $0.updateTitle() } }
    if changed.contains("adblock") { windows.forEach { $0.tabs.setAdblock(s["adblock"] as? Bool ?? true) } }
    if changed.contains("eq"), let eq = s["eq"] { windows.forEach { $0.tabs.pushEq(eq) } }
    if first || changed.contains("glass") { windows.forEach { $0.setGlass(s["glass"] as? Bool == true) } }
  }

  // Menu: standard Mac menus; browser commands go to the UI as Electron "shortcut" events.
  func buildMenu() {
    let main = NSMenu()
    func sub(_ title: String, _ items: [NSMenuItem]) { let m = NSMenu(title: title); items.forEach(m.addItem); let it = NSMenuItem(); it.submenu = m; main.addItem(it) }
    func cmd(_ title: String, _ key: String, _ shortcut: String, _ mods: NSEvent.ModifierFlags = [.command]) -> NSMenuItem {
      let it = NSMenuItem(title: title, action: #selector(menuCommand(_:)), keyEquivalent: key)
      it.keyEquivalentModifierMask = mods; it.representedObject = shortcut; it.target = self; return it
    }
    // The Electron version's menus (src/main.js buildMacMenu).
    let services = NSMenuItem(title: "Services", action: nil, keyEquivalent: ""); services.submenu = NSMenu(); NSApp.servicesMenu = services.submenu
    let hideOthers = NSMenuItem(title: "Hide Others", action: #selector(NSApplication.hideOtherApplications(_:)), keyEquivalent: "h"); hideOthers.keyEquivalentModifierMask = [.command, .option]
    sub("The Stupid Browser", [
      NSMenuItem(title: "About The Stupid Browser", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: ""),
      .separator(), cmd("Settings…", ",", "settings"), .separator(), services, .separator(),
      NSMenuItem(title: "Hide The Stupid Browser", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h"), hideOthers,
      NSMenuItem(title: "Show All", action: #selector(NSApplication.unhideAllApplications(_:)), keyEquivalent: ""), .separator(),
      NSMenuItem(title: "Quit The Stupid Browser", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")])
    sub("File", [cmd("New Tab", "t", "new-tab"), cmd("New Window", "n", "new-window"), cmd("New Private Window", "n", "new-incognito", [.command, .shift]),
                 cmd("Reopen Closed Tab", "t", "reopen-tab", [.command, .shift]), cmd("Copy Link", "c", "copy-url", [.command, .shift]), .separator(),
                 cmd("Open Location…", "l", "focus-address"), cmd("Close Tab", "w", "close-tab"), cmd("Close Window", "w", "close-window", [.command, .shift]), .separator(),
                 cmd("Print…", "p", "print")])
    let pasteMatch = NSMenuItem(title: "Paste and Match Style", action: #selector(NSTextView.pasteAsPlainText(_:)), keyEquivalent: "v"); pasteMatch.keyEquivalentModifierMask = [.command, .option, .shift]
    sub("Edit", [NSMenuItem(title: "Undo", action: Selector(("undo:")), keyEquivalent: "z"), NSMenuItem(title: "Redo", action: Selector(("redo:")), keyEquivalent: "Z"), .separator(),
                 NSMenuItem(title: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x"), NSMenuItem(title: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c"),
                 NSMenuItem(title: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v"), pasteMatch,
                 NSMenuItem(title: "Delete", action: #selector(NSText.delete(_:)), keyEquivalent: ""), NSMenuItem(title: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")])
    let fullscreen = NSMenuItem(title: "Toggle Full Screen", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f"); fullscreen.keyEquivalentModifierMask = [.command, .control]
    sub("View", [cmd("Reload", "r", "reload"), cmd("Toggle Sidebar", "e", "toggle-sidebar", [.command, .shift]), cmd("Toggle AI Sidebar", "a", "toggle-ai", [.command, .shift]),
                 cmd("Toggle Bookmarks Bar", "b", "toggle-bookmarks-bar", [.command, .shift]), .separator(),
                 cmd("Actual Size", "0", "zoom-reset"), cmd("Zoom In", "+", "zoom-in"), cmd("Zoom Out", "-", "zoom-out"), .separator(),
                 cmd("Developer Tools", "i", "devtools", [.command, .option]), fullscreen])
    sub("History", [cmd("Back", "[", "back"), cmd("Forward", "]", "forward"), cmd("Home", "h", "home", [.command, .shift]), .separator(), cmd("Show All History", "y", "history")])
    sub("Bookmarks", [cmd("Bookmark This Tab", "d", "bookmark"), cmd("Bookmark Manager", "b", "bookmarks", [.command, .option])])
    let windowMenu = [NSMenuItem(title: "Minimize", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m"),
                      NSMenuItem(title: "Zoom", action: #selector(NSWindow.performZoom(_:)), keyEquivalent: ""), .separator(),
                      NSMenuItem(title: "Bring All to Front", action: #selector(NSApplication.arrangeInFront(_:)), keyEquivalent: "")]
    sub("Window", windowMenu)
    NSApp.windowsMenu = main.items.last?.submenu
    sub("Help", [cmd("The Stupid Browser on GitHub", "", "github", [])])
    NSApp.helpMenu = main.items.last?.submenu
    NSApp.mainMenu = main
  }
  @objc func menuCommand(_ sender: NSMenuItem) {
    guard let s = sender.representedObject as? String else { return }
    switch s {
    case "new-window": openWindow(incognito: false, urls: nil)
    case "new-incognito": openWindow(incognito: true, urls: nil)
    case "github": NSWorkspace.shared.open(URL(string: "https://github.com/lattewirell-creator/stupid-browser")!)
    default:
      if let w = NSApp.keyWindow?.windowController as? BrowserWindow { w.emit("shortcut", [s]) }
      else if s == "new-tab" { openWindow(incognito: false, urls: nil) }
    }
  }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
