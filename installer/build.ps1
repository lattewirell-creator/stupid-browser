# Builds the friendly installer around release\StupidBrowser-Setup.exe (run on Windows; the C# compiler ships with it).
param([string]$Setup = "release\StupidBrowser-Setup.exe", [string]$Out = "release\StupidBrowser-Install.exe")
$ErrorActionPreference = "Stop"
$csc = "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if (-not (Test-Path $Setup)) { throw "Missing $Setup" }
& $csc /nologo /target:winexe /optimize+ /platform:anycpu "/out:$Out" /win32icon:build\icon.ico "/resource:$Setup,setup.exe" /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.Management.dll installer\Install.cs
if ($LASTEXITCODE -ne 0) { throw "csc failed" }
Get-Item $Out | Select-Object Name, Length
