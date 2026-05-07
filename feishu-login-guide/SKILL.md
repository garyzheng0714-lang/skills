---
name: feishu-login-guide
description: "AI 执行手册：在任何项目里稳定接入飞书登录，自带 FBIF 品牌的统一登录页（浅色背景、FBIF logo、'使用 FBIF 登录'按钮）。AI 收集 App ID/Secret/部署 URL → 自动写入跨项目统一的后端 OAuth 代码（Go/Node/Python，含 tenant_key 白名单兜底）+ 前端组件（React，含 FeishuLoginPage 整页登录、FBIF logo、飞书 OAuth 按钮）+ 部署 fbif-logo.webp 到 public/ + 写 .env + 改 .gitignore → 输出待办清单（去飞书后台加白名单、配置应用可用范围限定 FBIF 员工和关联组织、配 ALLOWED_TENANT_KEYS）。所有项目接出来的登录入口视觉、文案、URL 路径都一致。MUST trigger when the user says: 「给项目加飞书登录」「接入飞书登录」「飞书 OAuth」「Feishu login」「Feishu SSO」「飞书扫码登录」「飞书端内免登」「FBIF 登录」, or invokes /feishu-login-guide."
version: 1.1.0
owner: garyzheng
private: false
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Grep
  - Glob
---

# Feishu Login Guide — AI 执行规范

**这份文件给 AI 看，不是给用户看。** 用户不需要懂 OAuth 原理。AI 严格按本规范执行，目标是每次接入都产出**视觉/路径/行为完全一致**的飞书登录，不要"自由发挥"。

跨项目稳定性是这个 skill 唯一的核心目标。

---

## 不变量（跨所有项目，永远一致）

写代码前先记住这些**绝不能变**的东西。AI 不需要每次跟用户讨论这些，直接照做。

### 路由路径

| 路径 | 用途 |
|---|---|
| `GET /auth/feishu/login` | 触发登录（302 跳飞书授权页） |
| `GET /auth/feishu/callback` | 飞书授权回调 |
| `POST /auth/feishu/logout` | 退出登录 |
| `GET /api/me` | 当前登录用户 JSON，未登录返 401 |

### 视觉规范（FBIF 品牌为默认）

按 `assets/login-ui-spec.md` 严格执行：

- **页面浅色背景**（绝不用暗色，用户明确要求）
- **FBIF 蓝 `#145078`**（按钮主色）
- **按钮文案"使用 FBIF 登录"**（不是"飞书登录"，但按钮内嵌飞书 logo 让用户知道走的是飞书 OAuth）
- 整页登录用 `FeishuLoginPage` 组件
- 顶部 logo 是 `assets/fbif-logo.webp`，登录按钮内的飞书 logo 是 `assets/feishu-logo.svg` (inline)

**AI 不得修改这些视觉值**。如果接入的是非 FBIF 项目，把 fbif-logo.webp 替换+组件 `appName` props 改即可，视觉规格不变。

### 环境变量

| 名 | 必填 | 值 |
|---|---|---|
| `FEISHU_APP_ID` | 是 | 应用 App ID（cli_xxx），写代码里也行（不是机密） |
| `FEISHU_APP_SECRET` | 是 | App Secret，**只**通过环境变量注入，绝不写代码 |
| `FEISHU_REDIRECT_URI` | 是 | 完整回调 URL，例如 `http://localhost:8080/auth/feishu/callback` |
| `FEISHU_ALLOWED_TENANT_KEYS` | 否 | 逗号分隔白名单 tenant_key。配了就**只允许这些企业的飞书账号登录**。详见「登录范围控制」一节 |

### 安全死规则（违反 = 严重 bug）

1. `user_access_token` **绝不下发到前端**。只活在后端。
2. cookie 必须 `HttpOnly + SameSite=Lax`（不能 Strict，OAuth 回调跳转时不带）
3. state 必须密码学随机、回调时核对、不一致 → 403
4. `redirect_uri` 字符级一致（飞书白名单和代码里）
5. `.env` 必须在 `.gitignore`
6. 后端必须做 `tenant_key` 兜底校验（飞书后台"应用可用范围"是第一道防线，代码是第二道）

---

## 执行流程

### Step 1: 探测项目栈

```bash
ls -a
test -f go.mod && cat go.mod | grep -E 'gin|echo|fiber|chi' | head -3
test -f package.json && cat package.json | grep -E 'express|fastify|next|vite|react' | head -5
test -f pyproject.toml && cat pyproject.toml | grep -E 'fastapi|flask|django' | head -3
test -f requirements.txt && grep -E 'fastapi|flask|django' requirements.txt | head -3
test -f .gitignore && grep -E '^\.env$' .gitignore
```

按结果选模板：

| 信号 | 模板 |
|---|---|
| `go.mod` + `gin` | `templates/backend/go-gin/feishu_oauth.go.template` |
| `go.mod` 无 web 框架 | `templates/backend/go-net-http/feishu_oauth.go.template` |
| `package.json` + `express` | `templates/backend/node-express/feishuOauth.ts.template` |
| `pyproject.toml` 或 `requirements.txt` 含 `fastapi` | `templates/backend/python-fastapi/feishu_oauth.py.template` |
| `package.json` + `vite/react` | + `templates/frontend/react-vite/FeishuLogin.tsx.template` |
| 完全无法识别 | 问用户："这个项目用什么栈？" 然后按用户回答选最接近的模板 |

**没有对应栈的模板**：直说"我没有 X 栈的现成模板，按 Go net/http 版本翻译给你看"。**绝不假装有。**

### Step 2: 一次性收集输入

用 AskUserQuestion 一次问完。不要分多轮。

**必填**：
- App ID（让用户从飞书后台 → 凭证与基础信息复制）
- App Secret（让用户粘贴；**警告**："Secret 会进入 Claude Code transcript，完事后建议去飞书后台 → 凭证与基础信息 → 重置 Secret"）

**可推断**（不要主动问）：
- 部署 URL：默认 `http://localhost:8080`，如果用户回的有线索（package.json scripts、go run -port 等）按线索推
- 登录场景：默认 OAuth 跳转，用户除非说"扫码"或"端内免登"，不要问

**仅在用户提到时问**：
- 端口（如果 8080 跟项目实际端口冲突）
- 登录场景（用户说扫码 / 端内免登时）

### Step 3: 自动写文件

收齐输入后**直接执行**，不要逐文件征求确认。

#### 3.1 后端

读对应栈的模板，替换占位符：
- `{{APP_ID}}` → 用户给的 App ID
- `{{REDIRECT_URI}}` → `<部署URL>/auth/feishu/callback`，例如 `http://localhost:8080/auth/feishu/callback`

写到固定路径（**不要变路径**）：

| 栈 | 路径 |
|---|---|
| Go net/http | `internal/auth/feishu_oauth.go` |
| Go Gin | `internal/auth/feishu_oauth.go` |
| Node Express | `src/middleware/feishuOauth.ts` |
| Python FastAPI | `app/middleware/feishu_oauth.py` |

如目录不存在，`mkdir -p`。

#### 3.2 前端（仅在检测到 React 时）

读 `templates/frontend/react-vite/FeishuLogin.tsx.template`，**原样复制**到 `src/lib/feishuLogin.tsx`（无占位符替换）。

⚠️ **不要修改组件里的视觉值**。FBIF logo、飞书 logo、按钮颜色 `#145078`、文案"使用 FBIF 登录"、整页登录布局——全部跨项目一致。所有项目长得一样这件事本身就是价值。

**同时部署 FBIF logo 静态资源**：

```bash
# 把 skill 自带的 webp logo 拷到项目的静态资源目录
cp assets/fbif-logo.webp <project>/public/fbif-logo.webp
```

Vite/Next.js/CRA 都默认把 `public/` 挂在根路径，浏览器请求 `/fbif-logo.webp` 就能拿到。如果项目用别的静态资源目录，按项目约定放。

如果用户的项目还没登录页路由，**主动建议**他在 React Router 里加：

```tsx
import { FeishuLoginPage } from './lib/feishuLogin';
<Route path="/login" element={<FeishuLoginPage />} />
```

#### 3.3 .env 和 .env.example

```bash
# .env（追加，不要覆盖）
echo "FEISHU_APP_ID=<App ID>" >> .env
echo "FEISHU_APP_SECRET=<Secret>" >> .env

# .env.example（追加 key，值留空）
echo "FEISHU_APP_ID=" >> .env.example
echo "FEISHU_APP_SECRET=" >> .env.example
```

如果 `.env` 已含 `FEISHU_APP_*`，**不要覆盖**：告诉用户"`.env` 里已有这些 key，没动它"。用 grep 检查，不要无脑 append。

#### 3.4 .gitignore

```bash
test -f .gitignore || touch .gitignore
grep -qE '^\.env$' .gitignore || echo '.env' >> .gitignore
```

### Step 4: 自检（写完后必须确认这 5 项都过）

- [ ] 后端文件已写入正确路径
- [ ] 前端文件已写入（如果有前端）
- [ ] `.env` 含 `FEISHU_APP_ID` 和 `FEISHU_APP_SECRET`
- [ ] `.gitignore` 含 `.env`
- [ ] 后端代码里 `redirect_uri` 跟你即将告诉用户去白名单加的 URL 字符级一致

任何一项没过 → 修完再继续。

### Step 5: 输出待办清单

用这个**精确格式**输出（不要改、不要发挥）：

```
✓ 已写入：
  - <后端路径>
  - <前端路径>（如有）
  - <project>/public/fbif-logo.webp（如有前端）
  - .env
  - .env.example
  - .gitignore（已确保 .env 在忽略列表）

接下来你必须自己做的事（skill 不能代你完成）：

【1】去飞书后台加 redirect URL 白名单
    打开 https://open.feishu.cn/app → 你的应用 → 安全设置 → 重定向 URL
    加这一条（字符级一致，不要多/少斜杠）：
        <REDIRECT_URI>

【2】配置「应用可用范围」（限定哪些飞书账号能登录）
    打开 https://open.feishu.cn/app → 你的应用 → 应用发布 → 可用范围
    选「指定成员」→ 加上 FBIF 全员 + 关联组织成员
    （这是第一道防线。不在范围内的飞书账号点登录会看到飞书自带的「无权限」提示页）

【3】配置 ALLOWED_TENANT_KEYS（代码层兜底，第二道防线）
    在 .env 里加：
        FEISHU_ALLOWED_TENANT_KEYS=<FBIF 的 tenant_key>,<关联组织的 tenant_key>
    第一次登录时后端日志会打出 tenant_key 给你，复制粘贴进 .env 即可。
    留空则不限制——但生产环境强烈建议设。

【4】在主路由文件挂载飞书 router
    <按栈给具体代码片段，例如：>
    Go + Gin: 在 cmd/server/main.go 里：
        import "<your-module>/internal/auth"
        auth.RegisterFeishuRoutes(r)

【5】实现 2 个 TODO 函数（数据库相关，skill 不能猜）
    打开 <后端路径>，找两个 TODO：
    - upsertLocalUser(*FeishuUser) → 按 OpenID 在 users 表 upsert
    - createSession(...) → 设你自己的 session cookie

【6】可选：实现 GET /api/me 端点
    前端组件 useCurrentUser 会调这个端点。
    返回 JSON: {name, email?, avatar_url?, open_id}
    未登录返 401。

【7】可选：登录页路由
    如果项目还没 /login 路由，加一条：
        <Route path="/login" element={<FeishuLoginPage />} />

【8】安全提醒
    Secret 已进入本会话 transcript。完成接入后，
    建议去飞书后台 → 凭证与基础信息 → 重置 Secret，
    再把新值更新到 .env。

验证：
    curl -i http://<host>:<port>/auth/feishu/login
    期望：302 + Location 含 accounts.feishu.cn/open-apis/authen/v1/authorize

    用未登录浏览器（隐身窗口）访问 /login：
    应看到带 FBIF logo 的浅色登录页 → 点"使用 FBIF 登录" → 跳飞书授权 → 跳回应用 → 顶栏显示头像和名字

碰到错误？读 references/error-codes.md
登录范围怎么配？读下面「登录范围控制」一节
想理解 OAuth 工作原理？读 references/explainer.md（仅 AI 自学用）
```

---

## 登录范围控制（仅 FBIF 员工 + 关联组织）

默认行为是"任何能拿到飞书授权的账号都能登录"。但用户的真实需求通常是"**仅限 FBIF 员工和关联组织成员**"。这个限制有**两层**：

### 第一层：飞书后台的「应用可用范围」（必做）

这是**飞书系统级别**的限制，不在范围内的账号点登录会看到飞书自带的"你没有 X 应用使用权限"页面（参考 [图 2 那种界面]）—— 用户根本走不到我们的代码。

配置方式：

1. 打开 https://open.feishu.cn/app → 你的应用 → **应用发布** → **可用范围**
2. 选 **指定成员**（不要选"全员可见"）
3. 加上：
   - FBIF 主企业的全员或部门
   - 关联组织（飞书有「关联组织」机制，伙伴企业的成员可以访问应用）

**关联组织怎么加**：
- FBIF 飞书管理员去飞书管理后台 → 组织架构 → 关联组织 → 邀请伙伴企业
- 伙伴企业接受后，他们的成员就可以出现在应用可用范围的"指定成员"里
- 不需要伙伴企业重新创建飞书应用

### 第二层：代码层 `tenant_key` 白名单（兜底）

万一第一层漏配、或者飞书后台被误改，代码层再做一次 tenant_key 校验。

配置方式：

```bash
# .env
FEISHU_ALLOWED_TENANT_KEYS=fbif_tenant_xxx,partner_tenant_yyy
```

**怎么知道 tenant_key 的值**：

1. 第一次让 FBIF 员工登录，看后端日志里会有 `tenant_key=xxxx` 字段（user_info 接口返回）
2. 复制这个值到 `.env` 的 FEISHU_ALLOWED_TENANT_KEYS
3. 关联组织成员第一次登录时同样 —— 看日志拿到他们企业的 tenant_key，加进白名单

### 为什么需要两层？

- 第一层（飞书后台）→ 用户体验最好（飞书自己拦住、显示友好页）
- 第二层（代码）→ defense-in-depth，防止配置漂移

留空 `FEISHU_ALLOWED_TENANT_KEYS` = 不限制（开发期方便），但**生产环境强烈建议设**。

---

## 三种场景的差异

默认是 OAuth 网页跳转登录，覆盖 95% 项目。其他两种场景：

- 扫码登录：后端代码完全不变，前端按 `references/scenarios/qr-code.md` 改
- 飞书端内免登：后端加一个 H5 回调路由，前端按 `references/scenarios/h5-in-feishu.md` 改

仅在用户明确说"扫码"或"端内免登"时切换；否则按默认走。

---

## 反模式（绝对不要）

1. **不要修改 React 组件里的视觉值**（颜色、字号、按钮高度、logo 尺寸、文案）。所有项目登录入口长得一样这件事本身就是价值。如果项目设计系统冲突，按视觉规范保留视觉值，只换实现方式。
2. **不要换路由路径**。`/auth/feishu/login` `/auth/feishu/callback` `/api/me` 跨项目一致，不要自由发挥成 `/login/feishu`、`/oauth/feishu` 等。
3. **不要替用户在飞书后台点按钮**。这是 Web UI 操作，给精确指令、让用户自己做。
4. **不要把 user_access_token 给前端**。任何 cookie / response body / localStorage 暴露 token 都是严重 bug。
5. **不要在主流程教用户 OAuth 原理**。用户不关心。如果用户问"为什么这样"，再指 references/explainer.md。
6. **不要假装支持的栈有模板**。没有就直说，按最接近的版本翻译。
7. **不要分阶段问问题**。Step 2 一次性收集，不要让用户感觉在做问卷。

---

## 资源清单

```
SKILL.md                                 ← 你正在读
assets/
  fbif-logo.webp                         ← FBIF 主品牌 logo（部署到项目 public/）
  fbif-logo.png                          ← FBIF logo 备用兼容版本
  feishu-logo.svg                        ← 飞书官方 logo（已 inline 进 React 模板）
  login-ui-spec.md                       ← 视觉/文案/路径统一规范（必读）
references/
  api-reference.md                       ← 飞书 OAuth 接口速查
  error-codes.md                         ← 错误码与排查（用户报错时引用）
  security-checklist.md                  ← 交付前安全清单
  explainer.md                           ← OAuth 工作原理（AI 自学用）
  scenarios/
    oauth-web.md                         ← 默认场景说明
    qr-code.md                           ← 扫码登录差异
    h5-in-feishu.md                      ← 飞书端内免登差异
templates/
  backend/
    go-net-http/feishu_oauth.go.template
    go-gin/feishu_oauth.go.template
    node-express/feishuOauth.ts.template
    python-fastapi/feishu_oauth.py.template
  frontend/
    react-vite/FeishuLogin.tsx.template  ← 含飞书 logo 的统一登录按钮
```

---

## 学习记录

每次完成接入后，追加一行到 `learnings.jsonl`：

```json
{"date":"YYYY-MM-DD","stack":"go-gin","scenario":"oauth-web","time_minutes":<数字>,"stuck_at":"null|<问题>"}
```

如果同一个 `stuck_at` 出现 3 次，提炼成新规则补到对应位置。
