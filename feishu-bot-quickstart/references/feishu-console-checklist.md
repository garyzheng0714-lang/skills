# Feishu Console Checklist (Long Connection)

Goal: receive `im.message.receive_v1` and reply with text messages.

1. Create a **self-built app** in Feishu Open Platform.
2. Enable **Bot** capability for the app.
3. Add required **permissions** (names vary by console version):
   - Receive message events (event subscription)
   - Send messages to chats
4. Configure **Event Subscriptions**:
   - Mode: **Long Connection**
   - Subscribe to event: `im.message.receive_v1`
5. Install / enable the app in your tenant as required by the console.
6. Add the bot to a test group, or start a DM with the bot.

Notes:
- This quickstart uses long connection, so you do **not** need to set up a public callback URL, signature verification, or encryption keys.
- If you later need interactive cards (button callbacks), you will typically need an additional HTTP callback subscription.
