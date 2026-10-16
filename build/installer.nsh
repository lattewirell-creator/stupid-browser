; Registers The Stupid Browser as a web browser for the current user so it appears in
; Windows Settings > Apps > Default apps (Windows decides the default; the app opens that page).
!macro customInstall
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\StupidBrowser" "" "The Stupid Browser"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\StupidBrowser\DefaultIcon" "" "$INSTDIR\StupidBrowser.exe,0"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\StupidBrowser\shell\open\command" "" '"$INSTDIR\StupidBrowser.exe"'
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\StupidBrowser\Capabilities" "ApplicationName" "The Stupid Browser"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\StupidBrowser\Capabilities" "ApplicationDescription" "A calm personal web browser"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\StupidBrowser\Capabilities" "ApplicationIcon" "$INSTDIR\StupidBrowser.exe,0"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\StupidBrowser\Capabilities\URLAssociations" "http" "StupidBrowserURL"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\StupidBrowser\Capabilities\URLAssociations" "https" "StupidBrowserURL"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\StupidBrowser\Capabilities\FileAssociations" ".htm" "StupidBrowserHTML"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\StupidBrowser\Capabilities\FileAssociations" ".html" "StupidBrowserHTML"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\StupidBrowser\Capabilities\StartMenu" "StartMenuInternet" "StupidBrowser"
  WriteRegStr HKCU "Software\RegisteredApplications" "The Stupid Browser" "Software\Clients\StartMenuInternet\StupidBrowser\Capabilities"

  WriteRegStr HKCU "Software\Classes\StupidBrowserURL" "" "The Stupid Browser URL"
  WriteRegStr HKCU "Software\Classes\StupidBrowserURL" "URL Protocol" ""
  WriteRegStr HKCU "Software\Classes\StupidBrowserURL\DefaultIcon" "" "$INSTDIR\StupidBrowser.exe,0"
  WriteRegStr HKCU "Software\Classes\StupidBrowserURL\shell\open\command" "" '"$INSTDIR\StupidBrowser.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\StupidBrowserHTML" "" "The Stupid Browser HTML Document"
  WriteRegStr HKCU "Software\Classes\StupidBrowserHTML\DefaultIcon" "" "$INSTDIR\StupidBrowser.exe,0"
  WriteRegStr HKCU "Software\Classes\StupidBrowserHTML\shell\open\command" "" '"$INSTDIR\StupidBrowser.exe" "%1"'
  ; tell Explorer associations changed
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro customUnInstall
  DeleteRegKey HKCU "Software\Clients\StartMenuInternet\StupidBrowser"
  DeleteRegValue HKCU "Software\RegisteredApplications" "The Stupid Browser"
  DeleteRegKey HKCU "Software\Classes\StupidBrowserURL"
  DeleteRegKey HKCU "Software\Classes\StupidBrowserHTML"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
