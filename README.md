# skills

给 AI 助手（Claude Code、Codex、Claude 桌面版和网页版）用的技能库。这里只放现在能正常用的技能。

| 技能 | 用途 |
| --- | --- |
| [`feishu-anycross`](feishu-anycross/) | 飞书集成平台（AnyCross）：查、搭、改工作流，配网址触发器和单点登录，附 124 个组件的资料库。 |
| [`feishu-login-guide`](feishu-login-guide/) | 给项目接入飞书登录：新项目走集成平台单点登录（OIDC），附 Go、Node 后端模板、合规测试和登录页组件。 |

以前的 27 个旧技能已经从这里删掉。要找回，在存档 tag [`archive-2026-10-16-before-cleanup`](https://github.com/garyzheng0714-lang/skills/tree/archive-2026-10-16-before-cleanup) 里都有。

## 安装

先把仓库拉到本机（只需一次）：

```bash
git clone https://github.com/garyzheng0714-lang/skills.git ~/garyzheng-skills
```

再把要用的技能链接进去，下面以 `feishu-anycross` 为例，换成别的技能名同理。

**Claude Code**

```bash
ln -s ~/garyzheng-skills/feishu-anycross ~/.claude/skills/feishu-anycross
```

**Codex**

```bash
ln -s ~/garyzheng-skills/feishu-anycross ~/.codex/skills/feishu-anycross
```

**Claude 桌面版或网页版**

到 [Releases](https://github.com/garyzheng0714-lang/skills/releases) 下载 `feishu-anycross.zip`，在设置里的技能（Skills）页面上传。`feishu-login-guide` 的说明超过了桌面版的长度上限，暂时只能在 Claude Code 和 Codex 里用。

## feishu-login-guide 要注意

仓库里不带密钥。技能会先找本机的 `feishu-login-guide/assets/secrets/feishu-app-credentials.md`，找不到就问你要 App ID 和 Secret。App Secret 找飞书后台管理员拿，只写进项目服务器的 `.env`，不要发群里。

## 更新

```bash
git -C ~/garyzheng-skills pull
```

## 加新技能

每个技能一个文件夹，`SKILL.md` 放在文件夹根目录。只放验证过能用的技能。不写密钥、回调地址和员工信息。推送前跑一遍检查，它会核对技能头信息、相对链接，并扫描密钥、回调地址、公网 IP 和不该上传的文件：

```bash
python3 scripts/check.py
```
