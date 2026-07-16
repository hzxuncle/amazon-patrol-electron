# Task 6 Report: preload.js — contextBridge API 桥

**Status:** DONE

## 实现内容

创建了 `electron/preload.js`，通过 `contextBridge.exposeInMainWorld('electronAPI', {...})` 暴露以下 API：

### 消息通信
- `sendMessage(action, payload)` → `ipcRenderer.invoke(action, payload)`
- `onMessage(callback)` — 注册回调，接收主进程推送事件

### 存储操作
- `storage.get(key)` → `ipcRenderer.invoke('STORAGE_GET', key)`
- `storage.set(key, value)` → `ipcRenderer.invoke('STORAGE_SET', key, value)`
- `storage.remove(key)` → `ipcRenderer.invoke('STORAGE_REMOVE', key)`
- `storage.onChanged(callback)` — 注册回调，接收 `STORAGE_CHANGED` 事件

### 其他
- `saveExcel(buffer)` → `ipcRenderer.invoke('SAVE_EXCEL', buffer)`
- `getLoginItem()` → `ipcRenderer.invoke('GET_LOGIN_ITEM')`
- `setLoginItem(openAtLogin)` → `ipcRenderer.invoke('SET_LOGIN_ITEM', openAtLogin)`

### 主进程推送事件监听
- `PATROL_UPDATE` → messageCallbacks
- `PATROL_COMPLETE` → messageCallbacks
- `CRON_AUTO_START` → messageCallbacks
- `STORAGE_CHANGED` → storageChangeCallbacks

## 语法验证

```
/home/ec2-user/.nvm/versions/node/v16.20.2/bin/node --check electron/preload.js && echo OK
OK
```
