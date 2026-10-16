# 登录态与飞书授权续期（2026-10-15 用户裁定）

> 用户原话：「能否做成保持 30 天？如果 30 天没有任何操作（包括登录），登录再失效；如果有登录，就自动续期 30 天……要不然过期之后就让大家重新授权，其实是很麻烦的。」「这不单单是这一个项目的问题，而是所有项目都存在这个问题。」

## 事故：会话还在，飞书功能先坏

2026-10-15 排版工具（FBIF-排版工具）有同事导入飞书文档，页面显示「导入失败 / 飞书云文档服务暂不可用」。实际原因：

1. 排版工具的会话是 30 天滑动续期，人一直是登录状态；
2. 导入时服务端先用保存的 `refresh_token` 换 `user_access_token`；
3. 这个人一周多没用飞书文档功能，`refresh_token` 已过期，飞书返回 `HTTP 400 {"code":20037,"error":"invalid_grant"}`；
4. 代码没读飞书业务码，把它兜底成「服务暂不可用」，用户和排查的人都被误导。

## 两个寿命，必须分开管

| | 谁定 | 多长 | 怎么续 |
|---|---|---|---|
| 项目自己的登录会话 | 项目 | **30 天滑动**：每次使用续到「现在 + 30 天」 | 项目自己签发新会话令牌 |
| 飞书 `user_access_token` | 飞书 | 约 2 小时（以 `expires_in` 为准） | 用 refresh_token 换 |
| 飞书 `refresh_token` | 飞书 | **约 7 天**（以 `refresh_token_expires_in` 为准，官方示例 604800，非固定值）、**只能用一次** | 每次刷新返回新的，旧的立即作废 |
| 飞书授权总寿命 | 飞书 | 连续授权满 365 天必须重新授权 | 只能重新登录 |

**规则：**

1. **会话不依赖飞书令牌**。`/api/me`、门禁中间件只验项目自己的会话（签名 + 版本号 + 用户状态），不得每次去飞书验 `access_token`，不得因 `access_token` 过期判未登录。
2. **会话 30 天滑动**。已登录请求（至少 `/api/me`，前端每次打开页面都会调）重签会话，`exp = 现在 + 30 天`，同时下发 cookie 和 `X-Session-Token`（响应头 + 响应体），前端接住新令牌覆盖本地存储。连续 30 天没用才过期。
3. **只做登录的项目不存 refresh_token**。登录回调读完 `user_info` 就丢掉飞书令牌；它们的「登录失效」只可能是会话没做滑动，按第 2 条改即可。
4. **登录后还以用户身份调飞书 API 的项目**（云文档、群列表、日历等）必须做「授权保活」：会话有效期内由服务端后台替用户轮换 refresh_token，见下节。
5. **不建集中令牌库**（2026-10-15 用户问过「放在飞书多维表格里、用集成平台刷新」，结论不做）：refresh_token 是以用户身份读其文档/群聊的长期凭证，刷新还要带各项目 App Secret，放进多维表格等于明文共享给所有能看表、导出、跑自动化的人；refresh_token 只能用一次，集成平台与项目服务端两边都用会互相作废；所有项目还会多一个在线依赖。统一靠本 skill 的代码规范，不靠共享存储。确需「可视化」只做**不含令牌**的状态看板（谁、哪个项目、最近使用、授权正常/需重新登录）。

## 授权保活（需要持续用户身份的项目）

### 存储字段（每个用户）

| 字段 | 含义 |
|---|---|
| `feishu_refresh_token_seal` | refresh_token 加密后的值（AES-GCM，密钥由服务端密钥派生），**绝不明文落盘、绝不下发前端** |
| `last_seen_at` | 最近一次使用（`/api/me` 时写，**按小时节流**，别每个请求都写盘） |
| `last_login_at` | 最近一次飞书登录 |
| `feishu_token_refreshed_at` | refresh_token 上次轮换时间（登录回调、每次刷新都写） |
| `feishu_refresh_expires_at` | 飞书给的到期时间 = 轮换时间 + `refresh_token_expires_in` |
| `feishu_reauth_required` | 飞书明确拒绝了 refresh_token，只能重新登录；登录成功即清除 |

### 刷新（请求路径与后台保活共用同一个函数）

```text
refreshLocked(userID):            # 调用方持有「刷新锁」（全局或按用户），同一时刻只有一个刷新
  for 最多 2 次:
    user = 从库里重读               # 不信调用方手里的旧值：refresh_token 只能用一次，可能已被别人用掉
    if user.reauth_required or 无 seal: return ErrReauthRequired
    used = user.seal
    resp, err = 飞书 POST /open-apis/authen/v2/oauth/token (grant_type=refresh_token)
    if err 是飞书业务拒绝 且 code ∈ {20024, 20026, 20037, 20064, 20073}（或 error=invalid_grant）:
        if 库里 seal 仍 == used:      # CAS
            清空 seal、置 reauth_required、记日志（用户 id/姓名/错误码，不写令牌）
            return ErrReauthRequired
        else: continue                # 并发轮换：别人刚换上了新令牌，用新的再试，不能误伤
    if err != nil: return err         # 20050/20072/5xx/网络：临时故障，保留旧令牌，下次重试
    if resp 无 refresh_token: 置 reauth_required; return ErrReauthRequired   # 旧的已用掉
    if 库里 seal 仍 == used:          # 成功写回同样 CAS，且先落盘再发 access_token
        原子写回 新 seal + refreshed_at=now + refresh_expires_at，清 reauth_required
        缓存 access_token 到 now + expires_in
    else:                             # 刷新期间重新登录过：库里是更新的授权，不覆盖
        不写库、不缓存，这次的 access_token 只给本次请求用
    return access_token
```

要点：

- **飞书刷新接口的错误在 HTTP 400 的响应体里**（`{"code":20037,"error":"invalid_grant",...}`）。HTTP 客户端遇到非 2xx 必须仍解析 JSON 拿业务码，不能只返回「status 400」。
- 错误码分两类（官方《刷新 user_access_token》）：20026 无效、20037 过期、20064 撤销、20073 已被使用、20024 与 client_id 不匹配 → 需重新授权；20050（500）、20072（503）→ 临时故障，稍后重试，**不得**因此把人打成「需重新登录」。
- 刷新锁 + 重读 + CAS 三件套缺一不可，否则两个请求（或部署时新旧两个进程）同时刷新，一个把令牌用掉，另一个拿到 20073，用户就被误判成要重新授权。
- **CAS 两头都要**（2026-10-15 Codex 复核发现）：标记失效时比对，成功写回时也比对。登录回调不拿刷新锁，刷新在途时这个人重新登录，旧授权链的结果不能盖掉刚登录拿到的新授权。
- 已知边界：飞书已用掉旧令牌、响应却在路上丢了（或收到后落盘失败），库里只剩用过的旧令牌，下次必然 20073。没有上游幂等接口，无法做到「恰好一次」，只能让这个人重新登录一次；不要为此做盲目重试。

### 后台保活任务

```text
每小时一轮（部署候选/只读暂停态跳过）:
  for 每个飞书用户:
    跳过：未启用、无 seal、已标 reauth_required
    lastActive = max(last_seen_at, last_login_at)
    # 只认真实使用：保活轮换本身会刷新 updated_at，拿它算活跃会让保活永不停止。
    # 上线前的老记录没有 last_seen_at 也从没被保活过，只有这种情况才用 updated_at 兜底一次。
    if now - lastActive > 30 天: 跳过          # 会话已过期，停止保活，令牌自然过期
    rotateAfter = min(3 天, (refresh_expires_at - refreshed_at) / 2)
    if refreshed_at 为空 或 now - refreshed_at >= rotateAfter:
        拿刷新锁 → 重读 → 再判一次是否到期 → refreshLocked
```

请求量：每个活跃用户约每 3 天 1 次刷新，十几个人的项目每天个位数请求，远低于飞书 1000 次/分钟限额。

### 报错给用户看什么

- 服务端：`ErrReauthRequired` → `403 {"code":"feishu_reauth_required","error":"飞书授权已失效，请重新用飞书登录一次"}`。**不要**用 401（前端会当会话过期整页跳登录，丢掉用户手里的内容）。
- 前端：识别 `feishu_reauth_required`，就地显示「飞书授权已失效 / 重新用飞书登录一次即可，之后会自动续期」+ 链接「重新用飞书登录」→ `/auth/feishu/fbif/login?return_to=<当前路径>`。重新走 OAuth 不需要先退出：回调会覆盖 seal、清 `reauth_required`、签新会话。
- 日志：飞书非 2xx 一律带业务码（`feishu API status 400 (code=1069914)`），不带 msg 正文与令牌。

## 必须有的测试

1. 刷新被拒（20037/20064）→ 接口返回 `feishu_reauth_required`，库里清掉 seal、置标记；第二次请求不再打飞书；会话本身（`/api/me`）不受影响。
2. 临时故障（20050/20072/5xx）→ 不置标记、保留原 seal。
3. 并发轮换：第一次刷新时别人已换上新令牌并返回 20073 → 用新令牌重试成功，不误伤；刷新在途时重新登录写入了新授权 → 刷新结果不覆盖它、不进缓存。
4. 保活只轮换「30 天内用过且到期」的人：6 天未轮换的要续、昨天刚续的不动、31 天没用的不动、撤销的置标记；**再过 31 天无人使用时，保活自己刷新的 updated_at 不能让它继续续**。
5. `/api/me` 记 `last_seen_at`，并把会话续到「本次使用 + 30 天」。
6. 重新登录清除 `reauth_required`，写入轮换时间、到期时间、`last_seen_at`。
7. HTTP 客户端：刷新接口 400/503 能解析出业务码，错误串不含令牌。
8. 前端：授权失效显示「重新用飞书登录」链接且 `return_to` 是当前页面，不显示「服务暂不可用」。

## 生产参考实现

FBIF-排版工具（Go，JSON 用户库）2026-10-15 上线：

- `api/auth_service.go`：`userAccessToken` / `refreshFeishuTokenLocked` / `markFeishuReauthRequired` / `feishuTokenRotationDue` / `keepFeishuTokensAlive` / `startFeishuTokenKeepAlive`
- `api/auth_users.go`：`RotateFeishuRefreshToken`、`MarkFeishuReauthRequired`（CAS）、`TouchLastSeen`
- `api/feishu_provider.go`：`feishuOAuthError.reauthRequired()`、刷新接口按 JSON 解析非 2xx
- `api/auth_http.go`：`handleCurrentUser` 记最近使用并续签 30 天会话；登录回调写轮换时间
- `public/js/feishu-doc-import.js`：`renderReauth`
- 测试：`api/auth_feishu_keepalive_test.go`、`tests/feishu-doc-import.test.mjs`（最后一条）
