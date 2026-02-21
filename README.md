# Skills 仓库说明

仓库地址：`git@github.com:garyzheng0714-lang/skills.git`

本仓库用于集中存放可复用的 Codex Skills，支持多设备同步与版本管理。

## 同步更新报告（2026-02-21）

本次从本地技能库 `~/.codex/skills` 对比同步到仓库，重点处理：

- 补齐缺失 skill：`ant-design`、`feishu-bitable-sidebar-plugin`
- 整理 README（同步报告、日志记录、各 skill 中文介绍）

## 日志与排障记录

### 1) 同步日志目录

- `/tmp/skill-sync-reports`
- `/tmp/skill-sync-dry-summary.txt`
- `/tmp/skill-sync-commit-summary.txt`

常见日志文件类型：

- `*-dry.md` / `*-dry.json` / `*-dry.stdout`
- `*-apply.md` / `*-apply.json` / `*-apply.stdout`
- `*-commit.stdout`

### 2) 关键问题与处理

1. SSH 22 端口被拦截
   - 现象：`Connection closed by ... port 22`
   - 处理：GitHub SSH 改为 443（`ssh.github.com`）
2. 推送被拒绝（远端领先）
   - 现象：`[rejected] main -> main (fetch first)`
   - 处理：先 `fetch`/`rebase`，或基于 `origin/main` 新建干净分支后推送

## Skills 中文介绍

| Skill | 中文介绍 |
| --- | --- |
| `aliyun-github-actions-deploy` | 为 Node Web/API 项目提供 GitHub Actions 自动部署到阿里云 ECS 的标准化方案（含 PM2 与健康检查）。 |
| `aliyun-ssh` | 提供阿里云 ECS 的 SSH 连接、远程命令执行、文件传输与安全配置能力。 |
| `ant-design` | 面向 Ant Design 项目与组件开发的实现、修复、文档与测试协同工作流。 |
| `bitable-field-shortcut-faas` | 飞书多维表格“字段捷径（FaaS）”插件开发与发布能力。 |
| `feishu-base-parser` | 解析飞书多维表格 `.base` 文件，输出业务结构与逻辑文档。 |
| `feishu-bitable-sidebar-plugin` | 飞书多维表格“边栏插件”开发专用能力，覆盖变量提取、字段绑定、固定宽度布局和端口排障。 |
| `feishu-bot-quickstart` | 快速搭建飞书机器人（长连接）并完成鉴权、收发消息与排障。 |
| `feishu-oauth-login-setup` | 飞书 OAuth 登录配置与问题定位（redirect_uri、回调、环境变量等）。 |
| `feishu-web-component-library` | 按飞书官方风格规范构建 Web 界面与组件。 |
| `find-skills` | 搜索、发现并安装可用 skills。 |
| `frontend-code-review` | 前端代码审查清单与输出模板（质量/性能/业务逻辑）。 |
| `frontend-design` | 高质量前端视觉与交互实现，强调可用性与差异化。 |
| `fullstack-developer` | 全栈开发能力（React/Next.js + Node.js + 数据库 + API + 部署）。 |
| `skills-repo-sync` | 本地与仓库技能目录的校验、diff、同步、报告生成与推送流程。 |
| `update-docs` | 根据代码变化识别文档影响面并更新文档。 |
| `webapp-testing` | 使用 Playwright 对本地 Web 应用进行自动化测试、截图与日志采集。 |

## 使用建议

- 修改 skill 后优先运行 dry-run，再执行 apply。
- 每次同步建议保持“一次一个 skill、一次一个 commit”，便于追踪。
- push 前先确认本地分支是否落后远端，避免再次触发非快进拒绝。
