#!/usr/bin/env node
// 生成账号表的两条自动化（多维表格工作流），人改了账号表就提醒项目当场核对那一行：
//   (a) 新增账号时：AddRecordTrigger 监听「账号」
//   (b) 改了账号、密码、账号状态或功能列时：SetRecordTrigger 只监听这几列（不监听状态、状态说明、最近登录，
//       系统自己的写回不会再触发它；也不认开放接口的批量修改）
// 两条都 POST <项目地址>/internal/auth/accounts-changed {"record_id":"rec…"}，不看回包。
//
// 接入时跑一次；代码里 Features（Node：features）改了再跑一次，再用 +workflow-update 换掉 (b)。
// 用法：
//   node account-hooks.mjs --origin https://tools.fbif.com --base-token <总账本 token> \
//     --table 'FBIF Tools｜账号' [--feature 导出 --feature 审批 …] [--out <目录>]
// 在 --out（默认当前目录）写出两个 JSON，并打印 lark-cli 命令。本脚本不调任何接口。
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

const { values: args } = parseArgs({
  options: {
    origin: { type: 'string' },
    'base-token': { type: 'string' },
    table: { type: 'string' },
    feature: { type: 'string', multiple: true, default: [] },
    out: { type: 'string', default: '.' },
  },
});
if (!args.origin || !args['base-token'] || !args.table) {
  console.error("用法：node account-hooks.mjs --origin https://<项目域名> --base-token <总账本 token> --table '<项目名>｜账号' [--feature <功能列名> …] [--out <目录>]");
  process.exit(2);
}
const origin = new URL(args.origin);
if (origin.protocol !== 'https:' || origin.pathname !== '/' || origin.search) {
  console.error('--origin 只写 https://<项目域名>，不带路径');
  process.exit(2);
}
const hook = origin.origin + '/internal/auth/accounts-changed';
// 系统写回的三列不能监听，否则每次写回都会再触发一次。
const SYSTEM_COLUMNS = ['状态', '状态说明', '最近登录'];
const bad = args.feature.filter((c) => SYSTEM_COLUMNS.includes(c) || ['账号', '密码', '账号状态'].includes(c));
if (bad.length) {
  console.error(`这些不是功能列：${bad.join('、')}`);
  process.exit(2);
}
// 粘贴、自动化批量改、同步、追加导入改的也要提醒；开放接口的批量修改（openAPIBatchUpdate）不算，那是系统自己写的。
const triggerControls = ['pasteUpdate', 'automationBatchUpdate', 'syncUpdate', 'appendImport'];

const notify = (triggerId) => ({
  id: 'notify',
  type: 'HTTPClientAction',
  title: '提醒登录服务核对这一行',
  next: null,
  data: {
    method: 'POST',
    url: [{ value_type: 'text', value: hook }],
    headers: [{ key: 'Content-Type', value: [{ value_type: 'text', value: 'application/json' }] }],
    body_type: 'raw',
    raw_body: [
      { value_type: 'text', value: '{"record_id":"' },
      { value_type: 'ref', value: `$.${triggerId}.recordId` },
      { value_type: 'text', value: '"}' },
    ],
    response_type: 'none',
  },
});

const stamp = Date.now();
const workflows = {
  'account-hooks-add.json': {
    client_token: `${stamp}-add`,
    title: `${args.table}：新增账号时提醒登录服务`,
    steps: [
      {
        id: 'trigger_add',
        type: 'AddRecordTrigger',
        title: '新增账号',
        next: 'notify',
        data: { table_name: args.table, watched_field_name: '账号', trigger_control_list: triggerControls },
      },
      notify('trigger_add'),
    ],
  },
  'account-hooks-set.json': {
    client_token: `${stamp}-set`,
    title: `${args.table}：改了账号、密码、账号状态或功能时提醒登录服务`,
    steps: [
      {
        id: 'trigger_set',
        type: 'SetRecordTrigger',
        title: '改了账号、密码、账号状态或功能',
        next: 'notify',
        data: {
          table_name: args.table,
          field_watch_info: ['账号', '密码', '账号状态', ...args.feature].map((field_name) => ({ field_name })),
          trigger_control_list: triggerControls,
        },
      },
      notify('trigger_set'),
    ],
  },
};

for (const [file, body] of Object.entries(workflows)) {
  const path = join(args.out, file);
  writeFileSync(path, JSON.stringify(body, null, 2) + '\n');
  console.log(`lark-cli base +workflow-create --base-token ${args['base-token']} --json @${path} --as user`);
}
console.log('建好后用 +workflow-enable 启用两条；功能列有变化时重跑本脚本，用 +workflow-update 换掉「改了…」那条。');
