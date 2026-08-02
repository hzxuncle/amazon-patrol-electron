!macro customInstall
  ; 安装前强制关闭旧进程，避免"无法关闭"弹窗
  nsExec::Exec '"$WINDIR\system32\taskkill.exe" /f /im "亚马逊监控助手.exe"'
  Sleep 1000
!macroend

!macro customUnInstall
!macroend
