# skills

给 AI 助手（Claude Code、Codex、Claude 桌面版和网页版）用的技能库。这里只放现在能正常用的技能。

| 技能 | 用途 |
| --- | --- |
| [`feishu-anycross`](feishu-anycross/) | 飞书集成平台（AnyCross）：查、搭、改工作流，配网址触发器和单点登录，附 124 个组件的资料库。 |

以前的 27 个旧技能已经从这里删掉。要找回，在存档 tag [`archive-2026-10-16-before-cleanup`](https://github.com/garyzheng0714-lang/skills/tree/archive-2026-10-16-before-cleanup) 里都有。

## 安装

先把仓库拉到本机（只需一次）：

```bash
git clone https://github.com/garyzheng0714-lang/skills.git ~/garyzheng-skills
```

**Claude Code**

```bash
ln -s ~/garyzheng-skills/feishu-anycross ~/.claude/skills/feishu-anycross
```

**Codex**

```bash
ln -s ~/garyzheng-skills/feishu-anycross ~/.codex/skills/feishu-anycross
```

**Claude 桌面版或网页版**

到 [Releases](https://github.com/garyzheng0714-lang/skills/releases) 下载对应技能的 zip，比如 `feishu-anycross.zip`，在设置里的技能（Skills）页面上传。

## 更新

```bash
git -C ~/garyzheng-skills pull
```

## 加新技能

每个技能一个文件夹，`SKILL.md` 放在文件夹根目录。只放验证过能用的技能。不写密钥、回调地址、租户代码和员工信息。
