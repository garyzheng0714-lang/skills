---
name: feishu-login-guide
description: "教学引导式接入飞书开放平台的原生 OAuth 登录。一步步带用户从「在开放平台创建应用」走到「浏览器跑通登录闭环」，每步给出可验证的成功标志、踩坑解读和多语言代码模板（Go/Node/Python + React）。覆盖三种场景：网页 OAuth 跳转、扫码登录、飞书端内免登。MUST trigger when the user says: 「教我接入飞书登录」「我想自己接入飞书 OAuth」「飞书登录怎么接」「不用网关原生对接」「飞书扫码登录」「飞书端内免登」「Feishu OAuth tutorial」，or whenever they want to learn the principle of Feishu login rather than one-click integration. 与 feishu-login-integration（黑盒接 Gary 网关）的区别：本 skill 是白盒原生对接、教学性质、用户能拿到 App ID/Secret 和完整代码。"
version: 0.1.0
owner: garyzheng
private: true
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Grep
  - Glob
  - WebFetch
---

# Feishu Login Guide

直接对接飞书开放平台、从零接入原生 OAuth 登录的**教学引导**。不依赖任何网关，最终用户拿到的是自己应用里的 App ID、Secret 和能在生产跑的代码。

## 何时用这个 skill vs `feishu-login-integration`

| 场景 | 用哪个 |
|---|---|
| "一句话接上飞书登录，别管细节" | `feishu-login-integration`（一键接 Gary 网关） |
| "教我接入"、"我想自己对接开放平台"、"理解原理" | **本 skill** |
| "不想依赖任何中间层" | **本 skill** |

如果一开始你不确定用户要哪种，**问一句**："你想要一句话黑盒接入（用 Gary 的网关），还是从开放平台创建应用一步步自己对接？"

## 设计哲学（重要——决定每次回复的语气）

1. **引导，不是代写。** 把 why 解释清楚，让用户自己理解每一步在做什么。代码模板是辅助，理解才是目标。
2. **每步给可验证标志。** "现在你应该看到 ____"，不靠猜、不靠"应该没问题"。
3. **节奏感。** 一次只推进一个阶段，等用户确认完成（看到那个标志）再进下一步。**绝不一次倒出全部 5 阶段。**
4. **变体按需加载。** 三种登录方式各有 references 文件；多语言模板按检测到的栈加载。

---

## 入口：先确认两件事

### 分支 1：哪种登录场景？

| 用户描述 | 进哪个流程 |
|---|---|
| 默认 / "网页加个登录按钮" / "OAuth" | 走 SKILL.md 主流程（OAuth 网页跳转） |
| "扫二维码"、"嵌二维码 SDK" | 主流程 + 读 `references/scenarios/qr-code.md` |
| "飞书内嵌应用"、"工作台免登"、"h5sdk" | 主流程 + 读 `references/scenarios/h5-in-feishu.md` |

如果用户没说清楚，问一句："你想要哪种？(1) 网页跳转飞书授权（最常见）(2) 扫二维码 (3) 应用嵌在飞书工作台里？"

### 分支 2：技术栈

**先看后再问**。在用户当前目录跑：

```bash
ls -a 2>/dev/null
test -f go.mod && cat go.mod | grep -E 'gin|echo|fiber' | head -3
test -f package.json && cat package.json | grep -E 'express|next|vite|react' | head -5
test -f pyproject.toml -o -f requirements.txt && echo "python project"
```

按结果分类：

| 信号 | 模板路径 |
|---|---|
| `go.mod` + `gin` | `templates/backend/go-gin/` |
| `go.mod` 无 web 框架 | `templates/backend/go-net-http/` |
| `package.json` + `express` | `templates/backend/node-express/` |
| `pyproject.toml` 或 `requirements.txt` | `templates/backend/python-fastapi/` |
| `package.json` + `vite/react/next` | `templates/frontend/react-vite/`（前端独立） |
| 空目录 / 不确定 | 问用户："这个项目用什么栈？" |

**没有对应模板时**：明说"这个栈我没有现成模板，先按 Go net/http 版本翻译给你看，你跟着改"。**绝不假装有。**

---

## 主流程：5 个阶段（必须按顺序，每阶段等用户确认完成才进下一步）

每个阶段固定四块：
- **目标** ：这一步在解决什么问题（why）
- **动作** ：用户具体做什么
- **可验证标志** ：完成后看得到什么、怎么验证
- **常见踩坑** ：可能卡哪、为什么

进入下一阶段前，问一句："上面 ____ 你看到了吗？看到了我们继续。" **得到肯定回复才走下一步。**

### 阶段 1：在飞书开放平台创建应用

**目标**：让飞书认识你的应用，拿到 `App ID` + `App Secret`（应用的"用户名 + 密码"）。

**动作**（让用户自己操作 Web UI）：
1. 打开 https://open.feishu.cn/app
2. 右上角点 **创建企业自建应用**
3. 填名字、上传 logo（任意 PNG）、写一句简介，创建
4. 进入应用详情，左侧菜单选 **凭证与基础信息**
5. 复制 **App ID** 和 **App Secret**，**贴回对话给我**

**可验证标志**：你看到形如 `cli_a1b2c3d4e5f6g7h8` 的 App ID（必定 `cli_` 开头）。

**常见踩坑**：
- 没创建应用的权限 → 让飞书企业管理员给你加 "应用开发者" 角色
- 找不到"凭证与基础信息" → 你点的是"商店应用"，不是"自建应用"，回去重选

> ⚠️ 拿到 Secret 之后**不要让用户写到任何 git 跟踪的文件里**。等到阶段 4 写代码时，让用户用环境变量 `FEISHU_APP_SECRET`，并把 `.env` 加到 `.gitignore`。

**等用户回 App ID（Secret 可以不发，告诉我"拿到了"即可）才进阶段 2。**

---

### 阶段 2：配置回调 URL（重定向 URL 白名单）

**目标**：告诉飞书"用户授权完应该跳回我哪个 URL"。这是 OAuth 安全模型的核心 —— 飞书只会把 `code` 发给白名单里的 URL，攻击者无法把 code 重定向到自己的服务器。

**动作**：
1. 应用详情页左侧菜单 → **安全设置**
2. **重定向 URL** 区域，加一条
   - 开发期：`http://localhost:<你的端口>/auth/feishu/callback`
   - 生产：`https://your.real.domain.com/auth/feishu/callback`
3. 保存

> 端口先问用户："你后端打算跑什么端口？我先按 8080 给你写代码（按 CLAUDE.md 优先冷门端口的话也可以用 19090），后面联调再调。"

**可验证标志**：白名单列表里能看到刚加的这条 URL。

**常见踩坑**：
- 后续报 **"请求非法"** 或 **"4401 应用暂不可用"** → 99% 是这一步没配，或 URL 跟代码里 `redirect_uri` 不**字符级一致**
- 多/少斜杠、`http` vs `https`、端口号、大小写、尾部 `/` —— 任何一个差异都会拒绝
- 同一个应用支持多条白名单 URL，开发和生产分开配，不要互相覆盖

**等用户确认"加完了"才进阶段 3。**

---

### 阶段 3：理解整个 token 流（写代码前先讲明白）

**目标**：让用户搞清楚后面的代码到底在做什么 —— 不是 copy paste，是知道每个动作为什么。

**用这张图给用户讲一遍**（直接贴到对话里）：

```
[用户浏览器]               [你的后端]              [飞书开放平台]
     |                        |                        |
     |--1. 点登录按钮--------->|                        |
     |                        |                        |
     |<--2. 302 → 跳 authorize URL（client_id, redirect_uri, state）|
     |                                                 |
     |--3. 用户在飞书页面点"授权"--------------------->|
     |                                                 |
     |<--4. 302 → 跳回 redirect_uri?code=xxx&state=xxx-|
     |                        |                        |
     |--5. 带 code 回到你后端->|                        |
     |                        |--6. POST /authen/v2/oauth/token-->|
     |                        |   body: code+id+secret |
     |                        |<--7. user_access_token + refresh--|
     |                        |                        |
     |                        |--8. GET /authen/v1/user_info----->|
     |                        |   header: Bearer <token>|
     |                        |<--9. open_id+name+email+avatar----|
     |                        |                        |
     |                        |--10. 在你库里 upsert 用户 →|
     |                        |   生成你自己的 session  |
     |<--11. 302 → 首页 + Set-Cookie: session=xxx-----|
```

**让用户口述确认理解的关键点**（一条条问，等回应）：

1. **`code` 不是身份**。它只是一次性授权券，5 分钟过期、用一次失效。
2. **`user_access_token` 才是身份凭证**，但**绝不能下发到浏览器**。它只活在后端。
3. **浏览器拿的是你自己的 session cookie**，不是飞书的 token。飞书登录只是"身份认证那一下"，之后的会话由你自己管。
4. **`state` 防 CSRF**。生成时存进短期 cookie 或 redis，回调时第一件事核对，不一致 → 403。

如果用户哪条没听懂，**从那条单独再讲一遍**，不要直接进下一阶段。理解 token 流 = 这个 skill 的核心价值。

**等用户说"懂了，继续"才进阶段 4。**

---

### 阶段 4：写后端代码

**目标**：实现"构造授权链接 → 处理回调 → 换 token → 拿用户信息 → 建本地 session"完整链路。

**动作**：
1. 读 `templates/backend/<检测到的栈>/feishu_oauth.<ext>.template` 的内容
2. 替换三个占位符：`{{APP_ID}}`、`{{APP_SECRET_ENV_VAR}}`、`{{REDIRECT_URI}}`
   - App ID 直接写代码里没问题（不是秘密）
   - **App Secret 必须用环境变量**，模板里读 `os.Getenv("FEISHU_APP_SECRET")` / `process.env.FEISHU_APP_SECRET` 等
3. 把模板写到项目合理位置（每个模板自带 README 说写哪）
4. 在 `.env` 写 `FEISHU_APP_SECRET=<secret值>`，`.env` 加到 `.gitignore`，`.env.example` 同步加这个 key 但值留空

**模板必含的关键代码（共性，所有语言一样）**：

| 步骤 | 关键点 |
|---|---|
| 生成 state | 用密码学随机（`crypto/rand` 等价物），16+ 字节 base64url |
| 存 state | 短期 cookie（HttpOnly + Secure + SameSite=Lax，TTL 10 分钟），或 server 端 redis |
| 跳 authorize | URL: `https://accounts.feishu.cn/open-apis/authen/v1/authorize`，query: `client_id`、`redirect_uri`（**urlencoded**）、`response_type=code`、`state` |
| 回调入口 | 第一件事核对 cookie 里的 state == query 里的 state，不一致 → 403 |
| 换 token | `POST https://open.feishu.cn/open-apis/authen/v2/oauth/token`，`Content-Type: application/json`，body: `{grant_type, client_id, client_secret, code, redirect_uri}` |
| 拿用户信息 | `GET https://open.feishu.cn/open-apis/authen/v1/user_info`，header `Authorization: Bearer <user_access_token>` |
| upsert 用户 | 用 `open_id`（在本应用内全局唯一）作为外键关联本地用户表 |
| 建 session | 你自己的 session cookie，不暴露任何飞书 token |

**可验证标志**（必须每条都过）：
1. `curl -i http://localhost:8080/auth/feishu/login` → 返回 302，`Location` 头包含 `accounts.feishu.cn/open-apis/authen/v1/authorize`，且 `state=` 不为空
2. 拿 location 里的 URL 在浏览器打开 → 看到飞书的"是否授权 ____ 应用"页面
3. 点同意 → 跳回 `localhost:8080/auth/feishu/callback?code=...&state=...`
4. 后端日志能看到：state 校验通过、token 接口 200、user_info 接口 200、用户被 upsert

**常见踩坑**（必须告诉用户提前知道）：
- **`redirect_uri` 跟阶段 2 配的不一致**（哪怕一个斜杠）→ 报"请求非法"
- **code 用过两次**（用户刷新回调页）→ 20003 错。回调里要保证幂等：第二次进来直接读 session 不要再换 token
- **`Authorization` 头漏了 `Bearer ` 前缀**（包括末尾空格）→ 401
- **把 `app_access_token` 当 `user_access_token` 用** → 这俩是不同凭证类型，本流程**只**关心 user_access_token
- **state 没存进 cookie 就跳走**（前后两次请求 cookie 不连续）→ 回调拿不到对照值

**写完后让用户跑通"可验证标志"的 4 条再进阶段 5。** 任何一条卡住就停下排查，不要往前走。

---

### 阶段 5：写前端 + 联调

**目标**：从用户视角看，整个登录闭环必须真的能跑通。

**动作**：
1. 读 `templates/frontend/react-vite/FeishuLogin.tsx.template`
2. 在登录页加一个按钮："使用飞书登录"，onClick → `window.location.href = '/auth/feishu/login'`
3. 处理"未登录"态：访问受保护路由时如果没 session cookie，自动跳 `/auth/feishu/login`
4. 登录成功后显示用户头像和名字（从你后端 `/api/me` 拿，不是直接读 cookie）

**联调验证（必须用真实浏览器走一遍，不要"看代码觉得没问题"就交付）**：

按 `references/security-checklist.md` 走完所有项，并且做以下场景：

| # | 操作 | 期望结果 |
|---|---|---|
| 1 | 隐身窗口访问 `localhost:8080` | 自动跳到飞书授权页 |
| 2 | 在飞书页点同意 | 跳回应用，显示自己的飞书头像 + 名字 |
| 3 | 刷新页面 | 仍然登录态（session cookie 在） |
| 4 | 手动清掉 session cookie 再访问 | 又跳飞书 → 这次飞书侧已记授权 → 直接回应用 |
| 5 | 手动改回调 URL 的 state 参数再访问 | 后端返回 403 |

**告诉我每一条的实际结果**。如果哪条挂了，把浏览器地址栏 URL + 后端日志贴给我，从那一步排查。

**全部通过后**：恭喜，飞书登录接入完成。给用户输出一份简短的"上线 checklist"：
- [ ] 生产环境的 redirect URL 已加白名单（HTTPS）
- [ ] `FEISHU_APP_SECRET` 通过部署平台的密钥管理注入（不是 `.env` 文件）
- [ ] cookie 设了 `Secure + HttpOnly + SameSite=Lax`
- [ ] 走过一次 `references/security-checklist.md`

---

## 三种场景的差异

主流程默认讲 **OAuth 网页跳转登录**（最常见）。其他两种场景的差异点：

- **扫码登录**：读 `references/scenarios/qr-code.md`。前端嵌入飞书的二维码 SDK，省了"点按钮跳走"那步。后端 token 流程完全一样。
- **飞书端内免登**：读 `references/scenarios/h5-in-feishu.md`。前端用 `tt.requestAccess` 直接拿 code（用户在飞书 App 里完全无感），跳过 authorize URL 跳转。后端 token 流程也完全一样。

**所以阶段 4（后端）的代码模板对三种场景是通用的。** 只有阶段 3 和 5 的前端部分有差异。

---

## 错误码

用户碰到错误码 → 引导他读 `references/error-codes.md`，里面有 OAuth + token + user_info 三个接口的常见错误码和排查动作。

## 安全清单

交付前必走 `references/security-checklist.md`。涵盖 state 校验、Secret 存放、token 不下发、HTTPS、cookie 配置等。

## API 速查

`references/api-reference.md` 集中列了所有相关接口的 URL、方法、参数、响应。代码模板里有具体调用，但用户/Claude 想速查时去这里。

---

## 反模式（绝对不要）

1. **不要一次倒出全部 5 阶段。** 用户消化不了。一次推进一个，等确认。
2. **不要在拿到 App ID 之前先写代码。** "去开放平台办手续"是接入飞书登录的真实门槛，让用户体会到。
3. **不要替用户在飞书后台点按钮。** 这是 Web UI 操作，给指引、让用户自己做。
4. **不要把 user_access_token 给前端。** 死规则。前端只该有你自己的 session cookie。
5. **不要假装支持的栈有模板。** 没有就直说，给最接近的版本让用户翻译。
6. **不要跳过"可验证标志"**。每阶段没确认看到那个标志，就不要进下一步。这是这个 skill 教学性的核心。

---

## 学习记录

每次成功带用户接入完成后，追加一行到 `learnings.jsonl`：

```json
{"date":"YYYY-MM-DD","scenario":"oauth-web|qr-code|h5","stack":"go-gin","stuck_at":"阶段X|null","notes":"具体卡在哪、怎么解的"}
```

如果同一种 `stuck_at` 出现 3 次，把它提炼成新规则补到对应阶段的"常见踩坑"。
