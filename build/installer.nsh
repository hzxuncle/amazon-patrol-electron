!macro customInstall
  ; 安装前强制关闭旧进程，避免"无法关闭"弹窗
  nsExec::Exec '"$WINDIR\system32\taskkill.exe" /f /im "亚马逊监控助手.exe"'
  Sleep 1000
!macroend

!macro customUnInstall
  ; 卸载时询问是否同时删除用户数据
  MessageBox MB_YESNO|MB_ICONQUESTION "是否同时删除应用数据（巡检记录、配置、站点设置等）？$\n$\n数据目录：$APPDATA\amazon-patrol" IDYES deleteData IDNO skipDelete
  deleteData:
    RMDir /r "$APPDATA\amazon-patrol"
  skipDelete:
!macroend
