# Permissions Checklist

Apply in this sequence: login first, then Wiki read permissions, then optional event permissions.

## A. OAuth Login Minimum

1. Create a self-built Feishu app in the target tenant.
2. Configure redirect URL in app security settings:
   - exact value: `{APP_BASE_URL}/api/auth/feishu/callback`
3. Ensure app can use OAuth authorization code flow.
4. In permission search, enable fields needed by `/open-apis/authen/v1/user_info`:
   - `获取用户 user ID` (recommended, used by many user mapping strategies)
   - Optional only if needed: `获取用户邮箱信息`, `获取用户手机号`, `获取用户受雇信息`

Note:
- `open_id` and `tenant_key` are always key outputs for login linkage.
- Some consoles label permissions by Chinese names; exact internal scope strings may differ by edition.

## B. Wiki Publishing MVP (for this project)

Enable read capabilities for Wiki + Docx + Drive file access. In permission search, use these keywords:

- `查看知识库` (Wiki space and node listing)
- `云空间文件读取` / `查看、评论、编辑和管理云空间中所有文件` (depending on app model)
- `新版文档` + `读取内容` / `获取文档所有块` (Docx blocks API)

If API calls still return 403:
- confirm app/user identity has membership/permission on the target Wiki space and documents
- add collaborator permission on files if needed

## C. Event Sync (Optional)

If using long connection:
- subscription mode: `长连接`
- no public callback URL needed for events

If using webhook:
- subscription mode: `将事件发送至开发者服务器`
- callback URL: `{APP_BASE_URL}/api/feishu/events`
- configure `FEISHU_VERIFICATION_TOKEN` and `FEISHU_ENCRYPT_KEY` if signature/encryption is enabled

For content sync acceleration, subscribe event:
- `drive.file.edit_v1`

## D. Publish/Install Requirement

After adding permissions or changing callback settings:
- publish new app version
- ensure app is installed/enabled in current tenant
- then re-test login
