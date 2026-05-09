# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

番茄钟（Tomato Clock）— 正向计时 PWA 应用。支持计时过程中记录活动、每日计时统计、待办事项和日志。

## Tech Stack

- **纯前端 PWA**：HTML + CSS + Vanilla JS，无框架依赖
- **数据存储**：localStorage（`tc_records`、`tc_todos`、`tc_journals`、`tc_timer`）
- **部署方式**：阿里云 ECS + Nginx 静态文件服务

## Project Structure

```
Tomato_Clock/
├── index.html        # 主页面（内联 CSS，响应式布局）
├── app.js            # 所有 JS 逻辑（DB/计时器/统计/待办/Tab切换）
├── manifest.json     # PWA 清单文件
├── sw.js             # Service Worker（离线缓存）
├── nginx.conf        # Nginx 部署配置示例
├── icons/
│   └── tomato.svg    # PWA 应用图标
└── package.json      # 项目元数据
```

## Architecture

应用采用模块化单页架构：

- **DB 模块**（`DB` 对象）— 封装所有 localStorage 读写操作，键统一带 `tc_` 前缀
- **计时器**（`Timer` 对象）— 状态机：`idle → running → paused`，基于 `Date.now()` 计算耗时，每 3s 自动持久化状态到 localStorage（支持页面刷新恢复）
- **统计** — `renderStats()` 读取当日记录，计算次数和总时长
- **待办** — `renderTodos()` / `addTodo()` / `toggleTodo()` / `deleteTodo()`，按日期存储
- **Tab 切换** — `switchTab()` 切换三个视图（计时/统计/待办）

## Timer State Machine

| 操作 | idle | running | paused |
|------|------|---------|--------|
| 开始 | → running | - | - |
| 暂停 | - | → paused | - |
| 继续 | - | - | → running |
| 停止 | - | → idle, 存记录 | → idle, 存记录 |
| 重置 | - | → idle, 丢弃 | → idle, 丢弃 |

## Development

项目为纯静态文件，无需构建步骤。直接在浏览器打开 `index.html` 即可开发调试。

```bash
# 本地开发（需要任意静态服务器）
python -m http.server 3000
# 或使用 VS Code Live Server 插件
```

## Deployment（阿里云）

1. 将文件上传到服务器（`/var/www/tomato-clock/`）
2. 配置 Nginx（参考 `nginx.conf`）
3. 设置域名并配置 HTTPS（推荐 Let's Encrypt / 阿里云 SSL 证书）
4. 确保 Nginx 中 Service-Worker-Allowed 头正确设置

## PWA Notes

- Token 生命周期由 Service Worker 管理（`sw.js`），cache-first 策略
- 图标使用 SVG 格式（`icons/tomato.svg`）
- manifest.json 中 `start_url` 为 `/`，`display: standalone`
