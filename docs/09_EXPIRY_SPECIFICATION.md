# textLove - Thirty-Minute Inactivity Expiry Specification

## 1. Authoritative Inactivity Policy

A conversation in textLove is an ephemeral session that automatically and irreversibly expires after **30 minutes of qualified conversation inactivity**.

The backend server is the **sole authoritative arbiter** of the expiration state. The client provides countdown previews for UX, but the server unconditionally rejects any interaction once the 30-minute threshold is crossed.

---

## 2. Qualifying Conversation Activity Rules

To prevent artificial prolonging of conversations via idle background tabs, **only deliberate, authenticated communication events reset the 30-minute inactivity timer**.

### Qualifying Actions (RESETS TIMER to $T + 30\text{m}$):
1. **Successful Message Relay (`msg:send`)**: When either participant transmits a validated, encrypted message payload that is relayed.
2. **Interactive Emoji Reaction (`msg:react`)**: When either participant sends a live emoji reaction to a message.

### Non-Qualifying Actions (DOES NOT RESET TIMER):
- **Presence Heartbeats / Ping-Pongs**: Routine WebSocket keepalive pings (`presence:heartbeat`, `ping`/`pong`).
- **Typing Indicators (`typing:start` / `typing:stop`)**: Passive cursor movement or typing alone without sending.
- **Window Focus / Tab Visibility Changes**: Focusing the browser window or clicking the screen.
- **Client Reconnections**: A client reconnecting after a network blip does not grant additional time.
- **Safety Number Modal Opens**: Inspecting fingerprints or viewing user profile information.

---

## 3. Dual Enforcement Engine

Expiration is enforced both **reactively on-demand** and **proactively via background sweeping**:

```
+------------------------------------------------------------------------+
| 1. Reactive Check (On Every Socket Event / HTTP Request)               |
|                                                                        |
|  At time t:                                                           |
|  if (t - conversation.lastActivityAt >= 1800000 ms [30 minutes]) {    |
|      TriggerConversationExpiry(conversationId);                        |
|      return REJECT("CONVERSATION_EXPIRED");                            |
|  }                                                                    |
+------------------------------------------------------------------------+

+------------------------------------------------------------------------+
| 2. Proactive Periodic Sweep (Backend Timer Daemon)                     |
|                                                                        |
|  Runs every 60 seconds:                                                |
|  Find all ActiveConversations where:                                   |
|      status == 'active' AND lastActivityAt <= (now - 30 minutes)       |
|  For each expired record:                                              |
|      - Update status = 'expired' in MongoDB                            |
|      - Emit 'conv:expired' to connected participant sockets            |
|      - Teardown socket room                                            |
|      - Clear volatile memory structures                                |
+------------------------------------------------------------------------+
```

---

## 4. Server-Side Enforcement When Both Participants Are Offline

Even if both participants close their laptops or navigate away, **the server maintains authoritative expiry**:
- The `expiresAt` timestamp in MongoDB is set to `lastActivityAt + 30 minutes`.
- When either participant reconnects later (e.g. 45 minutes later), the client requests active conversation status:
  - The server queries `ActiveConversations`.
  - The record is evaluated: `now > expiresAt`.
  - The server returns `{ status: "expired", reason: "30_MIN_INACTIVITY" }`.
  - Re-establishment of the expired conversation is strictly blocked.
- Any attempt to send a message to that `conversationId` returns `410 Gone` / `CONVERSATION_EXPIRED`.

---

## 5. Client-Side Teardown Behavior

Upon receiving the `conv:expired` event or detecting expiration on reconnect:

1. **Immediate In-Memory Message Purge**:
   - The React state holding the array of plaintext messages is set to `[]`.
   - Ephemeral session keys in memory are deleted.
   - Message bubble DOM elements are unmounted.
2. **Transition to Authoritative Expired UI**:
   - The chat interface transitions to a full-screen or card-level modal:
     > **"This conversation has expired."**
     > *"To preserve absolute privacy, textLove automatically ends conversations after 30 minutes of inactivity. All messages have been permanently removed from memory."*
   - A primary action button: *"Start New Conversation"* is presented.
3. **No Resurrection**:
   - Stale network packets or queued client inputs cannot resurrect the conversation. Any subsequent request requires an entirely new pairing invitation and key handshake.
