# 场景：双 App 双按钮模式（v3 legacy，仅维护存量项目用）

> ⚠️ **新接入禁止走这条路线。** v4（2026-07-06 用户裁决）默认是「单应用统一登录」：一个 FBIF 登录 App + 飞书「关联组织应用共享」，FBIF 和富的员工走同一个按钮（见 SKILL.md「v4 路线定调」）。本文档只服务一件事：**维护 v3 时代接入的存量项目**（如 stenographer 速记系统），别在维护时误把它们"升级"坏。

## 什么项目算 legacy 双 App

特征（满足任一即是）：
- `.env` 里有 `FEISHU_FUDE_APP_ID` / `FEISHU_FUDE_APP_SECRET`
- 后端有 `/auth/feishu/fude/*` 路由
- 登录页有两个按钮：「使用 FBIF 飞书登录」+「使用 富的 飞书登录」

**维护原则：双 App 后端保持原样，不主动迁移到单应用。** 迁移到单应用需要用户明确要求（涉及重开后台白名单、换 App、全员重新登录），不是顺手的事。登录页视觉例外：照 v7 改用 Su Design（见下面「双按钮视觉」）。

## 双 App 架构要点（v3 定稿）

- **两个独立飞书 App**：FBIF 主企业一个（每项目独立）、富的一个（多项目共享 `cli_a975bf6e72b95bc9`，凭证在密钥仓库「富的文化传媒」节）。每个用户只能用自己企业的按钮/二维码登录。
- **8 条 OAuth 路由**：`/auth/feishu/{fbif|fude}/{login,callback,qr-config,qr-callback}` + 共享 logout + `/api/me`。
- **4 条 redirect URL 白名单**：FBIF 后台 2 条（fbif 路径）+ 富的后台 2 条（fude 路径），**不要交叉**。
- **4 个独立 state cookie**：`feishu_state_{fbif|fude}_{oauth|qr}`。
- **环境变量**：`FEISHU_FBIF_APP_ID/SECRET` + `FEISHU_FUDE_APP_ID/SECRET` + `FEISHU_REDIRECT_BASE`。

## 双按钮视觉（v7 · Su Design 登录卡）

登录页和单应用一样用 Su Design 的 `SignInCard`（照 `templates/frontend/react-vite/FeishuSignIn.tsx.template` 的 `FeishuSignInPage`：插画、FBIF logo、`subtitle`、`error` 都一样），只是 children 里直接写两个 Su Design `Button`，**不写任何色值、尺寸、圆角、阴影，不改 SignInCard**：

```tsx
<Button variant="primary" size="lg" className="w-full" onClick={() => { window.location.href = '/auth/feishu/fbif/login'; }}>
  <img src="/mascots/feishu-mark.svg" alt="" className="size-5" />
  使用 FBIF 飞书登录
</Button>
<Button size="lg" className="w-full" onClick={() => { window.location.href = '/auth/feishu/fude/login'; }}>
  <img src="/mascots/feishu-mark.svg" alt="" className="size-5" />
  使用 富的 飞书登录
</Button>
```

- FBIF 按钮在上，`variant="primary"`；富的按钮在下，默认 secondary（平的浅灰块）。靠 primary / secondary 表达主次，**不加** inline 标签（"主企业/关联企业"之类，v3.0 加过被定稿删除）
- 扫码：登录页默认无扫码入口；原本有扫码的存量项目照 `qr-code.md` 在 SignInCard 里加入口，扫码视图顶部的 [FBIF | 富的] 切换用 Su Design 的 `Segmented`（`npx shadcn@latest add @su/segmented`），切换时重拉对应企业 qr-config
- OAuth 视图顶部只有 FBIF logo，不为富的加单独 logo
- 沿革：v3.1 原来的写死色值、描边按钮和 pill Tab 于 2026-09-28（v7，设计统一到 Su Design）作废，维护时迁成上面的写法

## 双 App 特有的坑

1. **不要混用两个 App 的 secret**。FBIF callback 用 `FEISHU_FBIF_APP_SECRET` 调 token 接口，富的 callback 用 `FEISHU_FUDE_APP_SECRET`。混了 = `99991663` (app_access_token failed)。模板里两套常量分开命名（`FBIF_APP_*` / `FUDE_APP_*`），不要"DRY 简化"成一份。
2. **白名单交叉配置**：FBIF App 的白名单里出现 fude 路径（或反过来）= 回调 4401/20029。
3. **富的后台操作依赖富的管理员**——这是双 App 运维成本高的主因之一，也是 v4 反转的动机。
4. 登录后 session 是统一的：两个入口都进同一张 users 表，靠 `tenant_key + (user_id OR open_id)` 区分，退出/取当前用户无 tenant 分支。

## 如果用户要求迁移到 v4 单应用

按 SKILL.md v4 主流程重接（等于新接入），另加：
1. 确认 FBIF 登录 App 已开「关联组织应用共享」给富的（管理后台 admin.feishu.cn → 关联组织 → 应用共享）
2. 富的用户的 users 表记录**不用动**——`tenant_key + open_id` 在单应用下依然匹配同一个人（open_id 按 App 隔离！若换了 App ID，open_id 会变，老用户会被当新用户建档；`user_id` 不随 App 变，优先用 `tenant_key + user_id` 匹配可保住老档案）
3. 下线 fude 路由与 FUDE 环境变量，前端换成 `FeishuSignInPage`（只剩一个「使用飞书登录」按钮）
4. 双企业各一个真实账号从同一按钮登录验证后，才可宣布迁移完成
