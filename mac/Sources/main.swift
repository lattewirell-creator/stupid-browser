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

  func applicationDidFinishLaunching(_ n: Notification) {
    buildMenu()
    core = Core(app: self)
    core.start { [weak self] in self?.openWindow(incognito: false, urls: nil) }
  }

  @discardableResult
  func openWindow(incognito: Bool, urls: [String]?) -> BrowserWindow {
    let w = BrowserWindow(app: self, incognito: incognito, urls: urls)
    windows.append(w)
    w.showWindow(nil)
    if windows.count == 1 { w.selfTest() }
    return w
  }
  func windowClosed(_ w: BrowserWindow) { windows.removeAll { $0 === w } }
  func window(id: Int) -> BrowserWindow? { windows.first { $0.id == id } }

  func applicationShouldTerminateAfterLastWindowClosed(_: NSApplication) -> Bool { false }
  func applicationShouldHandleReopen(_: NSApplication, hasVisibleWindows: Bool) -> Bool {
    if !hasVisibleWindows { openWindow(incognito: false, urls: nil) }
    return true
  }

  // Menu: standard Mac menus; browser commands go to the UI as Electron "shortcut" events.
  func buildMenu() {
    let main = NSMenu()
    func sub(_ title: String, _ items: [NSMenuItem]) { let m = NSMenu(title: title); items.forEach(m.addItem); let it = NSMenuItem(); it.submenu = m; main.addItem(it) }
    func cmd(_ title: String, _ key: String, _ shortcut: String, _ mods: NSEvent.ModifierFlags = [.command]) -> NSMenuItem {
      let it = NSMenuItem(title: title, action: #selector(menuCommand(_:)), keyEquivalent: key)
      it.keyEquivalentModifierMask = mods; it.representedObject = shortcut; it.target = self; return it
    }
    sub("The Stupid Browser", [
      NSMenuItem(title: "About The Stupid Browser", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: ""),
      .separator(), cmd("Settings…", ",", "settings"), .separator(),
      NSMenuItem(title: "Hide The Stupid Browser", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h"),
      NSMenuItem(title: "Quit The Stupid Browser", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")])
    sub("File", [cmd("New Tab", "t", "new-tab"), cmd("New Window", "n", "new-window"), cmd("New Private Window", "n", "new-incognito", [.command, .shift]),
                 cmd("Reopen Closed Tab", "t", "reopen-tab", [.command, .shift]), .separator(), cmd("Close Tab", "w", "close-tab"), cmd("Print…", "p", "print")])
    sub("Edit", [NSMenuItem(title: "Undo", action: Selector(("undo:")), keyEquivalent: "z"), NSMenuItem(title: "Redo", action: Selector(("redo:")), keyEquivalent: "Z"), .separator(),
                 NSMenuItem(title: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x"), NSMenuItem(title: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c"),
                 NSMenuItem(title: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v"), NSMenuItem(title: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a"),
                 .separator(), cmd("Find…", "f", "find"), cmd("Find Next", "g", "find-next"), cmd("Copy Link", "c", "copy-url", [.command, .shift])])
    sub("View", [cmd("Reload", "r", "reload"), cmd("Command Bar", "k", "command-bar"), cmd("Zoom In", "=", "zoom-in"), cmd("Zoom Out", "-", "zoom-out"), cmd("Actual Size", "0", "zoom-reset"),
                 .separator(), cmd("Toggle Sidebar", "e", "toggle-sidebar", [.command, .shift]), cmd("AI Buddy", "a", "toggle-ai", [.command, .shift]), cmd("Focus Address Bar", "l", "focus-address")])
    sub("History", [cmd("Back", "[", "back"), cmd("Forward", "]", "forward"), cmd("Show History", "y", "history"), cmd("Rewind", "y", "rewind", [.command, .shift])])
    sub("Bookmarks", [cmd("Bookmark This Page", "d", "bookmark"), cmd("Show Bookmarks", "o", "bookmarks", [.command, .shift])])
    sub("Window", [NSMenuItem(title: "Minimize", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m"),
                   cmd("Next Tab", "}", "next-tab"), cmd("Previous Tab", "{", "prev-tab"), cmd("Downloads", "j", "downloads", [.command, .option])])
    NSApp.mainMenu = main
  }
  @objc func menuCommand(_ sender: NSMenuItem) {
    guard let s = sender.representedObject as? String else { return }
    switch s {
    case "new-window": openWindow(incognito: false, urls: nil)
    case "new-incognito": openWindow(incognito: true, urls: nil)
    default: (NSApp.keyWindow?.windowController as? BrowserWindow)?.emit("shortcut", [s])
    }
  }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
