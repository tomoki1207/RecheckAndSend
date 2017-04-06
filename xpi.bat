@echo off
set NEW_VER=
set /P NEW_VER="Input new version(x.x.x): "
7z.exe a -tzip  "RecheckAndSend-%NEW_VER%.xpi" .\src\*