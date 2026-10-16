# 查看、盘点与排错

全程只读。看完写一份诚实的记录文档，每条结论标实测、代码或推断，之后有新发现就回写这份文档。

## ID 和地址的样子

- 项目、工作流、版本、连接器 ID 都是 19 位数字。凭证 ID 是 13 位字母数字。
- 工作流页：`https://anycross.feishu.cn/console/integration/<项目ID>/workflow/<工作流ID>`
- 运行日志：`https://anycross.feishu.cn/console/integration/log`
- 凭证：`https://anycross.feishu.cn/console/integration/credential`（`/console/credential` 会 404，从左侧导航进最稳）
- 自建连接器：`https://anycross.feishu.cn/console/devkit/connector-v2/<连接器ID>/detail`
- 回调地址：`https://open.feishu.cn/anycross/trigger/callback/<一串 base64 样字符>`。这就是密钥。
- 步骤 ID 形如 `webhook-trigger-1`、`http-client-3`、`bitable-2`、`script-1`、`loop-3`、`branch-1`。表达式要引用这个 ID，不是显示名称。

## 页面自己的只读接口

官方没有导出和管理接口。已登录的控制台页面自己调用一组 `/webapi/*` 接口，能读出完整定义。在 `anycross.feishu.cn` 的页面里执行 `fetch(url, {credentials: 'include'})` 就能用页面的登录状态。只用 GET，查日志那个 POST 除外。这些是内部接口，随时可能变。（实测，2026-10）

| 用途 | 接口 | 要点 |
|---|---|---|
| 项目内文件树 | `GET /webapi/projects/<项目ID>/files` | 递归 `childResourceNodes`。`type===2` 是工作流，`resourceID` 是工作流 ID |
| 工作流草稿 | `GET /webapi/v2/flows/<工作流ID>` | `data.draft.definition` 是 JSON 字符串，要再 parse 一次。里面有 `steps[]`（id、type、operation、name、auth、parameters）。另有 `isPublished`、`isEnabled`、`latestVersion.id` |
| 已发布版本 | `GET /webapi/flows/<工作流ID>/versions/<版本ID>` | 返回 `flowDefinition` 和 `referencedVariables`（项目变量，明文）。写成 `/v2/.../versions` 会 404 |
| 运行日志 | `POST /webapi/flow_log/search_flow_log` | 见下一节 |
| 凭证列表 | `GET /webapi/connection_profiles` | `data.connProfiles`，有 `generation`（g1 旧版、g2 新版）、`authType`、`owner` |
| 凭证详情 | 新版 `GET /webapi/v2/connections/<凭证ID>?stage=draft`，旧版 `GET /webapi/connections/<凭证ID>` | 含密钥副本，只看长度或指纹 |

拿不到全部项目的列表接口。试过的几个都是 404 或 403。要列全部项目，打开编辑页的项目切换下拉，从 React 组件数据（fiber 的 `memoizedProps`）里读。也可以从全量日志反推，但只能拿到跑过的项目。（实测）

想知道页面调了什么接口，先调用一次抓网络请求的工具，再在界面上点一下。抓包从第一次调用时才开始。（实测）

## 查运行日志

请求体字段：`timeRange{left,right}`（毫秒）、`projectList`、`flowList`、`status`、`pageSize`、`page`、`asc`、`debug:false`。请求头只要 `content-type: application/json`。（实测）

- `projectList` 必须是二维数组 `[["<项目ID>"]]`。写成一维会报 `cannot unmarshal string into []string`。
- `count` 最多 10000，超过时 `tooMany=true`，按时间段或项目拆开查。
- 每条有 `flowName`、`flowDisabled`、`projectName`、`status`、`statusCode`、`cost`、`errorCnt`。
- 日志实际留约 32 天，文档写 30 天。
- 找死流程：按流程汇总 32 天内的运行和失败次数。启用中但 0 次运行的，就是候选。

## 排错先问这几件事

1. **请求真的进来了吗？** 异步触发器收到就回 200，要看日志里有没有这次运行。（实测）
2. **调用方在白名单里吗？** 白名单外返回 403（`code: 7`）。换参数没用。（实测）
3. **走的是哪条分支？** 分支条件要照真实写法拼请求，见 [触发器与回调](triggers-and-callbacks.md#分支条件)。
4. **下游真的成功了吗？** 步骤标成功，对方可能返回「服务已下线」。要看返回内容。曾有一条分支的下游从半年前就下线了，平台一直显示成功。（实测）
5. **平台是不是卡住了？** 偶尔会一步一直不返回，后面的步骤不触发，只能手动终止。重要流程要有定时对账兜底。（实测）
6. **事件被别人收走了吗？** 同一飞书应用的事件只交给一个接收方。（文档加推断）
7. **逻辑是不是分散在几处？** 集成平台、多维表格自动化、服务端代码常常串成一条链。先画出整条链，再跨三套日志查。（实测）

## 扫明文密钥和依赖

- 全量扫：所有项目的草稿和已发布版本，再加凭证。只扫一部分会漏，曾经从「1 处」扫成「3 处」。（实测）
- 最常见的写法：HTTP 节点里先用 `app_id` 加 `app_secret` 换 `tenant_access_token`，再调开放平台。能看这条流程的人都能拿到密钥，日志里可能也有。只有轮换密钥能让旧值作废。（实测）
- 查「谁在用这个飞书应用的密钥」时，必须单独扫集成平台的凭证和流程。只查服务器和代码仓库会漏。一个应用可能对应好几个凭证，新版旧版都有。（实测）
- 飞书应用加了 IP 白名单，会挡住跑在飞书机器上的东西，包括集成平台和多维表格插件。加白名单和换密钥一样可能弄断流程。（文档加推断）

## 输出时别泄露

- JS 输出不要带 auth、token、secret、cookie 这类字段名，也不要带查询串。浏览器扩展会把整段输出换成 `[BLOCKED: ...]`。给字段换短名，只输出长度或 sha256 前 8 位。
- 网址先打码再输出。打码正则要覆盖嵌套 JSON 里的网址。
- 凭证接口会返回负责人的名字、头像和 ID，过滤掉 owner、creator、avatar 字段。
- 外部接口 401 时可能把请求里的 token 原样回显。验证时只看 HTTP 状态码和 code。
