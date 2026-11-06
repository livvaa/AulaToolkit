; Uninstall (not update): give the official AULA drivers their exe names and autostart entries back,
; and take the aula command's folder off the user PATH (the app adds it, see src/main/cliPath.ts).
!macro customUnInstall
  ${ifNot} ${isUpdated}
    nsExec::Exec 'powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "$INSTDIR\resources\vendor-restore.ps1"'
    Pop $0
    nsExec::Exec `powershell.exe -NoProfile -WindowStyle Hidden -Command "$$d = '$INSTDIR\resources\bin'; $$p = [Environment]::GetEnvironmentVariable('Path', 'User'); [Environment]::SetEnvironmentVariable('Path', (($$p -split ';' | Where-Object { $$_ -and $$_.TrimEnd('\') -ine $$d }) -join ';'), 'User')"`
    Pop $0
  ${endIf}
!macroend
