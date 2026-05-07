# skills

![类型](https://img.shields.io/badge/%E7%B1%BB%E5%9E%8B-%E9%85%8D%E7%BD%AE%E4%BB%93%E5%BA%93-2563eb)
![技术栈](https://img.shields.io/badge/%E5%86%85%E5%AE%B9-Codex%20Skills%20%2B%20Markdown-0f766e)
![状态](https://img.shields.io/badge/%E7%8A%B6%E6%80%81-%E6%8C%81%E7%BB%AD%E7%BB%B4%E6%8A%A4-16a34a)
![README](https://img.shields.io/badge/README-%E4%B8%AD%E6%96%87-brightgreen)

一个集中管理 Codex Skills 的配置仓库，用于沉淀可复用任务流程、脚本、参考资料和 agent 配置。

## 仓库定位

- **分类**：配置仓库 / agent 能力库。
- **服务对象**：需要在不同机器、不同项目之间复用 Codex 工作流的个人或团队。
- **边界说明**：本仓库保存 skill 文档和配套资产，不是某个业务应用源码，也不是单一飞书、微信或浏览器插件工程。

## 目录结构

```text
.
├── <skill-name>/
│   ├── SKILL.md              # skill 的触发场景、工作流和使用说明
│   ├── agents/openai.yaml    # 可选：OpenAI/Codex agent 配置
│   ├── scripts/              # 可选：辅助脚本
│   ├── references/           # 可选：参考文档
│   └── assets/               # 可选：图片、模板或示例工程
└── README.md
```

仓库地址：

```text
git@github.com:garyzheng0714-lang/skills.git
```

## 当前 Skills

| Skill | 用途 |
| --- | --- |
| `aliyun-github-actions-deploy` | 为 Node Web/API 项目生成 GitHub Actions 到阿里云 ECS 的部署方案，包含 PM2、健康检查和回滚建议。 |
| `aliyun-ssh` | 阿里云 ECS SSH 连接、远程命令、文件传输和安全配置。 |
| `ant-design` | Ant Design 项目开发、修复、文档和测试工作流。 |
| `bitable-field-shortcut-faas` | 飞书多维表格字段捷径 FaaS 插件开发与发布。 |
| `feishu-base-parser` | 解析飞书多维表格 `.base` 文件，输出业务结构和逻辑文档。 |
| `feishu-bitable-sidebar-plugin` | 飞书多维表格边栏插件开发，覆盖变量提取、字段绑定、固定宽度布局和端口排障。 |
| `feishu-bot-quickstart` | 快速搭建飞书机器人长连接服务，完成鉴权、收发消息和排障。 |
| `feishu-login-guide` | 飞书 OAuth 登录从零接入教程，覆盖网页跳转/扫码/端内免登，含 Go/Node/Python/React 模板。 |
| `feishu-web-component-library` | 按飞书官方风格规范构建 Web 界面与组件。 |
| `ffmpeg-video-editor` | 将自然语言视频编辑需求转换为 FFmpeg 命令。 |
| `find-skills` | 搜索、发现并安装可用 skills。 |
| `frontend-code-review` | 前端代码审查清单与输出模板。 |
| `frontend-design` | 高质量前端视觉与交互实现。 |
| `fullstack-developer` | React/Next.js、Node.js、数据库、API 和部署相关全栈开发能力。 |
| `ljg-paper` | 学术论文阅读、拆解和 Org-mode 解读文档生成。 |
| `playwright-interactive` | 使用 Playwright 进行 Web 和 Electron 应用的交互式 UI 调试与 QA。 |
| `react-best-practices` | React/Next.js 性能优化规则集。 |
| `skill-creator` | 创建或更新 Codex Skill 的规划、初始化、编辑和验证流程。 |
| `skill-installer` | 从精选列表或 GitHub 仓库安装 Codex Skill。 |
| `skills-repo-sync` | 本地 skill 目录与仓库之间的校验、diff、同步、报告生成与推送。 |
| `update-docs` | 根据代码变化识别文档影响面并更新文档。 |
| `web-design-guidelines` | Web Interface Guidelines 可用性和无障碍审查。 |
| `webapp-testing` | 使用 Playwright 对本地 Web 应用做自动化测试、截图和日志采集。 |
| `zzh-feishu-card-table-handler` | 根据入参与期望输出生成飞书消息卡片表格 handler 代码，并推断字段映射。 |

## 使用方式

1. 根据任务选择对应 `<skill-name>/` 目录。
2. 优先阅读该目录下的 `SKILL.md`。
3. 只加载当前任务需要的 `references/`、`scripts/` 或 `assets/`。
4. 如 skill 提供脚本，先 dry-run 或局部验证，再执行会修改外部状态的操作。
5. 如果在 Codex 环境中同步，请确认目标 skill 路径和仓库分支一致。

## 维护流程

添加或更新 skill 时建议按以下顺序处理：

1. 更新 `<skill-name>/SKILL.md`。
2. 如需脚本或模板，放到同一 skill 目录的 `scripts/`、`references/` 或 `assets/`。
3. 运行该 skill 自带的验证脚本；若无脚本，至少人工检查 Markdown、路径引用和示例命令。
4. 更新本 README 的清单和用途说明。
5. 提交单一主题 commit，便于后续回溯。

## 脚本与资产

本仓库没有统一的根级构建脚本。各 skill 可以按需提供：

- `scripts/`：自动化脚本、校验脚本、生成器。
- `references/`：任务说明、排障手册、规范材料。
- `assets/`：模板、图片、示例工程或测试素材。
- `agents/`：适配 Codex / OpenAI agent 的配置文件。

## 维护说明

- 每次同步建议保持“一次一个 skill、一次一个 commit”。
- push 前确认本地分支与远端同步，避免非快进拒绝。
- 不要把真实密钥、私有账号信息、服务器 IP 密码或生产配置写入 skill 文档。
- 具体执行方式取决于使用这些 skills 的 Codex / agent 环境。
