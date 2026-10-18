// Keyboard shortcuts, the Electron version's table (src/main.js shortcutFor + macShortcutFor), checked for
// every key press in a browser window, whether the UI or a web page has focus. Also the Konami code.
import Cocoa

enum Shortcuts {
  private static var konami = 0
  private static let KONAMI = ["arrowup", "arrowup", "arrowdown", "arrowdown", "arrowleft", "arrowright", "arrowleft", "arrowright", "b", "a"]
  private static let KONAMI_URL = "https://www.youtube.com/watch?v=0vngOmw2hcM&autoplay=1"

  static func install(_ app: AppDelegate) {
    NSEvent.addLocalMonitorForEvents(matching: .keyDown) { e in
      guard let w = e.window?.windowController as? BrowserWindow, e.window?.attachedSheet == nil else { return e }
      let key = keyName(e), code = codeName(e)
      checkKonami(w, e, key)
      guard let cmd = shortcutFor(key: key, code: code, cmd: e.modifierFlags.contains(.command), shift: e.modifierFlags.contains(.shift),
                                  alt: e.modifierFlags.contains(.option), ctl: e.modifierFlags.contains(.control)) else { return e }
      switch cmd {
      case "new-window": app.openWindow(incognito: false, urls: nil)
      case "new-incognito": app.openWindow(incognito: true, urls: nil)
      case "fullscreen": w.window?.toggleFullScreen(nil)
      default: w.emit("shortcut", [cmd])
      }
      return nil
    }
  }

  private static func checkKonami(_ w: BrowserWindow, _ e: NSEvent, _ k: String) {
    if e.isARepeat || !e.modifierFlags.intersection([.command, .control, .option]).isEmpty { return }
    var n = konami
    n = k == KONAMI[n] ? n + 1 : (k == KONAMI[0] ? (n == 2 && k == "arrowup" ? 2 : 1) : 0)
    if n == KONAMI.count { n = 0; w.emit("open-url", [["url": KONAMI_URL, "where": "foreground"]]) }
    konami = n
  }

  /// Electron's input.key, lowercased.
  static func keyName(_ e: NSEvent) -> String {
    switch e.keyCode {
    case 123: return "arrowleft"; case 124: return "arrowright"; case 125: return "arrowdown"; case 126: return "arrowup"
    case 48: return "tab"; case 51: return "backspace"; case 117: return "delete"; case 53: return "escape"; case 36, 76: return "enter"
    case 115: return "home"; case 119: return "end"; case 116: return "pageup"; case 121: return "pagedown"
    case 122: return "f1"; case 120: return "f2"; case 99: return "f3"; case 118: return "f4"; case 96: return "f5"; case 97: return "f6"
    case 98: return "f7"; case 100: return "f8"; case 101: return "f9"; case 109: return "f10"; case 103: return "f11"; case 111: return "f12"
    default: return (e.charactersIgnoringModifiers ?? "").lowercased()
    }
  }
  /// Electron's input.code, for the few keys the table checks by position.
  static func codeName(_ e: NSEvent) -> String {
    switch e.keyCode {
    case 0x18: return "Equal"; case 0x21: return "BracketLeft"; case 0x1E: return "BracketRight"
    case 0x22: return "KeyI"; case 0x26: return "KeyJ"; case 0x20: return "KeyU"; case 0x0B: return "KeyB"
    case 0x45: return "NumpadAdd"; case 0x4E: return "NumpadSubtract"; case 0x52: return "Numpad0"
    default: return ""
    }
  }

  static func shortcutFor(key k: String, code: String, cmd: Bool, shift: Bool, alt: Bool, ctl: Bool) -> String? {
    if let m = macShortcutFor(k, code, cmd, shift, alt, ctl) { return m.isEmpty ? nil : m }
    let ctrl = cmd   // on macOS Ctrl+letter is text editing, so only Cmd counts
    if k == "f12" || (ctrl && shift && k == "i") { return "devtools" }
    if ctrl && shift && k == "j" { return "devtools" }
    if k == "f11" { return "fullscreen" }
    if k == "f5" { return shift ? "hard-reload" : "reload" }
    if k == "f3" { return shift ? "find-prev" : "find-next" }
    if k == "f6" || (alt && !ctrl && k == "d") { return "focus-address" }
    if alt && !ctrl && k == "arrowleft" { return "back" }
    if alt && !ctrl && k == "arrowright" { return "forward" }
    if alt && !ctrl && k == "home" { return "home" }
    if !ctrl { return nil }
    if shift {
      switch k {
      case "t": return "reopen-tab"; case "c": return "copy-url"; case "n": return "new-incognito"; case "w": return "close-window"
      case "a": return "toggle-ai"; case "e": return "toggle-sidebar"; case "b": return "toggle-bookmarks-bar"; case "o": return "bookmarks"
      case "y": return "rewind"; case "s": return "split"; case "r": return "hard-reload"; case "delete": return "clear-data"
      case "tab": return "prev-tab"; case "g": return "find-prev"
      default: return k == "+" || k == "=" || code == "Equal" || code == "NumpadAdd" ? "zoom-in" : nil
      }
    }
    switch k {
    case "tab", "pagedown": return "next-tab"
    case "pageup": return "prev-tab"
    case "t": return "new-tab"; case "n": return "new-window"; case "w", "f4": return "close-tab"; case "l": return "focus-address"
    case "k": return "command-bar"; case "d": return "bookmark"; case "r": return "reload"; case "h": return "history"; case "j": return "downloads"
    case "f": return "find"; case "g": return "find-next"; case "p": return "print"; case "u": return "view-source"; case ",": return "settings"
    default: break
    }
    if k == "+" || k == "=" || code == "NumpadAdd" { return "zoom-in" }
    if k == "-" || code == "NumpadSubtract" { return "zoom-out" }
    if k == "0" || code == "Numpad0" { return "zoom-reset" }
    if k.count == 1, let d = Int(k), d >= 1 { return "tab-\(k)" }
    return nil
  }
  /// macOS (Chrome for Mac) bindings. nil: fall through to the shared table; "": no shortcut.
  private static func macShortcutFor(_ k: String, _ code: String, _ cmd: Bool, _ shift: Bool, _ alt: Bool, _ ctl: Bool) -> String? {
    if ctl && !cmd && k == "tab" { return shift ? "prev-tab" : "next-tab" }
    if ctl && cmd && k == "f" { return "fullscreen" }
    if ctl { return "" }
    if !cmd { return ["f12", "f5", "f3", "f6"].contains(k) ? nil : "" }
    if alt {
      if k == "i" || code == "KeyI" || k == "j" || code == "KeyJ" { return "devtools" }
      if k == "u" || code == "KeyU" { return "view-source" }
      if k == "b" || code == "KeyB" { return "bookmarks" }
      if k == "arrowright" { return "next-tab" }
      if k == "arrowleft" { return "prev-tab" }
      return ""
    }
    if shift {
      if code == "BracketRight" || k == "}" { return "next-tab" }
      if code == "BracketLeft" || k == "{" { return "prev-tab" }
      if k == "h" { return "home" }
      if k == "j" { return "downloads" }
      if k == "backspace" || k == "delete" { return "clear-data" }
      if k == "w" { return "close-window" }
      return nil
    }
    if k == "[" || code == "BracketLeft" { return "back" }      // not Cmd+Arrow: that's line start/end in text fields
    if k == "]" || code == "BracketRight" { return "forward" }
    if k == "y" { return "history" }
    if ["h", "q", "m", "c", "v", "x", "a", "z"].contains(k) { return "" }   // app menu roles
    return nil
  }
}
