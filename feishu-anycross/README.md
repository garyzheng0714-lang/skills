# feishu-anycross

给 AI 助手（Claude Code、Codex、Claude 桌面版和网页版）用的飞书集成平台（AnyCross）技能。装上以后，让 AI 查、搭、改集成平台的工作流，或者配单点登录时，它会照着这里的规矩和踩坑记录做：先只读、改一处验证一处、不碰密钥、把流程备注写到没学过代码的人也能看懂。

里面有两部分：

- `SKILL.md` 和 `references/*.md`：团队在真实租户里跑出来的经验，每条标了证据等级（实测、文档、推断）。
- `references/guide/`：124 个组件的离线资料库，含事件与动作索引、表达式、平台限制。来自 [anycross-guide](https://github.com/garyzheng0714-lang/anycross-guide)，快照 2026-09-21。

## 安装和更新

见 [技能库首页](../README.md#安装)。

## 维护

改完跑一遍检查，它会核对技能头信息、所有相对链接，并扫一遍有没有误写进去的回调地址、App ID、IP 这类敏感信息：

```bash
python3 feishu-anycross/scripts/check.py
```

新经验加进 `references/` 对应的文件，写清证据等级。回调地址、密钥、租户代码、员工信息一律不写，用 `<项目ID>` 这类占位符。

## 说明

非官方整理，和飞书没有隶属关系。平台会更新，和当前界面冲突时以界面为准。许可证 MIT，见 [LICENSE](LICENSE) 和 [NOTICE](references/guide/NOTICE.md)。
