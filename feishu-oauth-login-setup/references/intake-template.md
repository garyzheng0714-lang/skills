# Intake Template (Ask First)

Use this template to collect facts before proposing fixes.

## Ask Order

1. Deployment origin and current login URL
2. Feishu app identity and secret status
3. Current console mode and event mode
4. Exact error evidence (URL, error code, log ID, screenshot text)

Ask at most 3 items per turn.

## Copy-Paste Questionnaire

```txt
1) 公网访问地址（APP_BASE_URL）：
   例如：http://112.124.103.65 或 https://docs.example.com

2) 当前点击“飞书登录”前的完整授权链接（authorize URL）：

3) FEISHU_APP_ID：

4) FEISHU_APP_SECRET 是否已写入服务器环境变量：
   - 已写入 / 未写入
   - 可仅提供前后 4 位用于核对

5) 当前 FEISHU_OAUTH_REDIRECT_URI：

6) 飞书后台订阅方式：
   - 长连接 longconn
   - 开发者服务器 webhook

7) 当前报错完整文案（含错误码与 log ID）：

8) 授权后浏览器最终跳转到的 URL：
```

## Mandatory Minimum Before Proceeding

- `APP_BASE_URL`
- `FEISHU_APP_ID`
- `FEISHU_APP_SECRET` (user confirms it exists on server)
- `FEISHU_OAUTH_REDIRECT_URI`

If any item is missing, continue intake and stop configuration steps.
