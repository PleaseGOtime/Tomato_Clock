# 番茄钟 - Tomato Clock

正向计时 & 倒计时，支持 PWA 网页版与 Android APK 双平台。

## 功能

- **正向计时** — 记录活动时长，支持暂停/继续/停止，可填写活动描述
- **倒计时** — 旋钮选时（触摸旋转/数字输入/快捷预设），到点振动提醒 + 系统通知
- **今日事项** — 每日待办清单 + 日志
- **明日规划** — 提前规划明天的待办和备忘
- **日历** — 按日期查看计时记录和日志
- **数据管理** — 导出备份 / 导入恢复 / 系统日志
- **Android APK** — 纯离线应用，无网络权限，通知栏前台服务保活（锁屏不中断计时）

## 版本选择

| | PWA 网页版 | Android APK |
|---|---|---|
| 安装方式 | 浏览器添加到主屏幕 | 直接安装 APK |
| 锁屏计时 | ❌ 浏览器暂停 | ✅ 前台服务保活 |
| 通知 | ⚠️ 有限支持 | ✅ 系统通知 |
| 离线可用 | ✅ Service Worker | ✅ 完全离线 |
| 网络权限 | 无 | ❌ 无（纯离线） |
| 文件位置 | 项目根目录 | `www/` + `android/` |

## 技术栈

- **网页版**：HTML + CSS + Vanilla JS，零框架依赖
- **存储**：localStorage（`tc_` 前缀）
- **APK**：Capacitor 7 + Android 原生 Foreground Service
- **部署**：阿里云 ECS + Nginx 静态文件服务

## 项目结构

```
├── index.html              # 网页版入口（内联 CSS）
├── app.js                  # 网页版 JavaScript
├── server.js               # Node.js 静态服务器
├── manifest.json           # PWA 清单
├── sw.js                   # Service Worker
├── nginx.conf              # Nginx 配置
├── tomato-clock.service    # systemd 服务
│
├── www/                    # APK 版前端源码（Capacitor 使用）
│   ├── index.html          # 入口（同根目录，可独立迭代）
│   └── app.js              # 含 NativeBridge 桥接代码
│
├── android/                # Android 原生项目（Capacitor 生成）
│   └── app/src/main/java/com/tomatoclock/app/
│       ├── MainActivity.java
│       ├── TimerPlugin.java         # JS ↔ 原生桥接插件
│       └── TimerForegroundService.java  # 前台服务（锁屏保活）
│
├── icons/
│   └── tomato.svg
├── capacitor.config.json   # Capacitor 配置
└── package.json
```

## 网页版开发

纯静态文件，无需构建步骤：

```bash
# 直接浏览器打开 index.html
# 或使用静态服务器
python -m http.server 3000
node server.js
```

## Android APK 构建

### 前置要求

- Node.js 18+
- JDK 17 或 21
- Android SDK（platform 35 + build-tools 35）

### 构建步骤

```bash
# 1. 安装依赖
npm install

# 2. 将网页代码同步到 Android 项目
npx cap sync android

# 3. 构建 APK
cd android && ./gradlew assembleDebug

# APK 输出路径：
# android/app/build/outputs/apk/debug/app-debug.apk
```

### 首次构建需要下载

| 组件 | 大小 | 说明 |
|------|------|------|
| Android SDK | ~1.5GB | 一次下载，所有 Android 项目复用 |
| Gradle | ~300MB | 缓存到 `~/.gradle`，下次无需下载 |
| npm 包 | ~50MB | 项目 `node_modules` |

后续构建只需 10-30 秒。

### 权限清单

APK 申请的权限均为计时功能必需：

| 权限 | 用途 | 用户可拒绝 |
|------|------|-----------|
| `FOREGROUND_SERVICE` | 锁屏后保持计时运行 | ❌ 必需 |
| `POST_NOTIFICATIONS` | 计时结束弹出通知 | ✅ 可拒绝，但无提醒 |
| `WAKE_LOCK` | 通知时唤醒屏幕 | 系统自动处理 |

**没有** INTERNET、存储、相机、定位、通讯录等权限。

## APK 安全说明

- 纯离线应用，**不声明 INTERNET 权限**，无法联网
- 数据存储在手机本地（`localStorage`），不传输到任何服务器
- 前台服务仅在计时进行时运行，不偷跑后台耗电
- 安装时用户可见所有权限申请，无隐藏权限

## 数据说明

所有数据存储在 localStorage，键带 `tc_` 前缀：

| 键 | 内容 |
|---|---|
| `tc_records` | 计时记录 |
| `tc_todos` | 待办事项（按日期） |
| `tc_journals` | 日志（按日期） |
| `tc_logs` | 系统日志 |
| `tc_up_timer` | 正向计时器状态 |
| `tc_down_timer` | 倒计时器状态 |

**建议**从系统 Tab → 导出备份，定期保存。

## 使用说明

### 计时
- 顶部切换「正向计时」/「倒计时」模式
- 正向计时：点击开始 → 填写活动描述 → 停止自动保存
- 倒计时：旋转旋钮或点时间数字输入 → 点击开始 → 到点振动 + 系统通知
- APK 版锁屏或切换应用后，通知栏会显示计时状态

### 今日 / 明日
- 添加待办事项，点击复选框标记完成
- 底部日志区记录每日总结或备忘

### 日历
- 左右切换月份，有计时记录的日期底部有红点
- 点击日期查看当天记录和日志

### 系统
- 查看存储状态、数据大小
- 导出备份 / 导入恢复
- 查看系统日志

## License

MIT
