# textLove - Presence & Live-Only Message Delivery Specification

## 1. Architectural Philosophy: The Live-Only Contract

textLove operates on an explicit **Live-Only messaging contract**:
- **Zero queues**: There is no store-and-forward mechanism, no dead-letter queue, no Redis buffer, and no retry engine.
- **Mutual Live Presence Precondition**: Both participants must be actively online and connected via an authenticated WebSocket.
- **Send-Time Verification**: Presence indicators are advisory and do not guarantee delivery. Authorization and recipient socket connectivity are re-verified **atomically at the exact millisecond a message is processed**.
- **No False Delivery Guarantees**: A message is never marked delivered until the peer client decrypts it and returns an explicit cryptographic acknowledgement.
- **Uncertainty is Communicated Honestly**: If a transport connection drops during relay, the sender UI reflects `DELIVERY_UNCERTAIN` rather than masking it.

---

## 2. In-Memory Connection Registry

The backend maintains an in-memory connection registry mapping active users to their connected socket IDs.

```typescript
interface ConnectedSocket {
  socketId: string;
  userId: string;
  username: string;
  connectedAt: Date;
  lastPingAt: Date;
}

class InMemConnectionRegistry {
  private userToSockets = new Map<string, Set<string>>(); // userId -> Set<socketId>
  private socketToUser = new Map<string, string>();        // socketId -> userId

  public register(userId: string, socketId: string): void {
    if (!this.userToSockets.has(userId)) {
      this.userToSockets.set(userId, new Set());
    }
    this.userToSockets.get(userId)!.add(socketId);
    this.socketToUser.set(socketId, userId);
  }

  public unregister(socketId: string): { userId: string; isOffline: boolean } | null {
    const userId = this.socketToUser.get(socketId);
    if (!userId) return null;

    this.socketToUser.delete(socketId);
    const sockets = this.userToSockets.get(userId);
    if (sockets) {
      sockets.delete(socketId);
      if (sockets.size === 0) {
        this.userToSockets.delete(userId);
        return { userId, isOffline: true };
      }
    }
    return { userId, isOffline: false };
  }

  public isUserOnline(userId: string): boolean {
    const sockets = this.userToSockets.get(userId);
    return Boolean(sockets && sockets.size > 0);
  }

  public getSocketsForUser(userId: string): string[] {
    const sockets = this.userToSockets.get(userId);
    return sockets ? Array.from(sockets) : [];
  }
}
```

---

## 3. Atomic Live-Only Relay Logic

When Alice emits `msg:send` to the server:

```
Alice Socket.IO Client 
         |
         | 1. msg:send { conversationId, recipientUsername, ciphertext, iv, seq }
         v
+-------------------------------------------------------------+
| Backend Event Handler                                       |
|                                                             |
| Step A: Verify Alice Authenticated & Authorized             |
| Step B: Fetch ActiveConversation from DB                    |
|         - Is status == 'active'?                            |
|         - Is (now - lastActivityAt) < 30 minutes?           |
| Step C: Atomic Recipient Presence Check                     |
|         - Look up recipient socket(s) in ConnectionRegistry |
+-------------------------------------------------------------+
         |
         +----------------------------------------------------+
         |                                                    |
[Recipient Found & Connected]                        [Recipient Offline]
         |                                                    |
         | Step D: socket.to(recipientSocketId)               | Immediate Rejection:
         |         .emit('msg:deliver', envelope)             | Emit 'msg:error' {
         |                                                    |   seq,
         | Step E: Await socket buffer push                   |   code: 'RECIPIENT_OFFLINE',
         | Step F: Emit 'msg:relayed' to Alice                |   message: 'Recipient is offline'
         | Step G: Dereference envelope from memory           | }
         v                                                    v
Recipient receives & decrypts                         Alice UI displays
Recipient emits 'msg:ack'                             red offline badge;
Alice receives 'msg:peer_ack'                         no auto-retry.
```

---

## 4. Message Delivery Lifecycle States

The client UI manages 5 distinct, transparent message states:

| Status Code | Visual UI Indicator | Description |
| :--- | :--- | :--- |
| `PENDING_RELAY` | Clock icon (Subtle Gray) | Encrypted locally, currently uploading to WebSocket buffer. |
| `RELAYED_TO_NETWORK` | Single Gray Checkmark | Successfully passed server edge buffer towards recipient device. |
| `DELIVERED_TO_PEER` | Double Gray Checkmark | Received by recipient client application. |
| `DECRYPTED_BY_PEER` | Double Emerald Checkmark | Validated AEAD tag, decrypted, and displayed on recipient screen. |
| `FAILED_OFFLINE` | Red Warning Exclamation | Recipient was offline or disconnected mid-flight. Not stored. |
| `DELIVERY_UNCERTAIN` | Amber Triangle Exclamation | Network timeout or socket dropped before relay confirmation. |

### Strict Rule: No Automatic Retries
If a send results in `FAILED_OFFLINE` or `DELIVERY_UNCERTAIN`, textLove **explicitly refrains from automated background replay loops**. The user is informed with a clear message:
> *"Message could not be delivered because your peer is offline. textLove does not store unsent messages. You may try again when your peer reconnects."*

---

## 5. Low-Bandwidth & Unstable Network Handling

textLove is designed for constrained networks:
1. **Lightweight Socket Payloads**: JSON payloads with compact binary representation for ciphertext and initialization vectors.
2. **Ping-Pong Heartbeats with Adaptive Fallback**: Socket.IO configured with 10-second ping interval and 5-second ping timeout.
3. **Graceful Disconnect Detection**:
   - If Alice loses network connectivity, client immediately sets UI status to `RECONNECTING...`.
   - Incoming typing indicators are throttled.
   - Any message attempt while reconnecting is blocked before transmission with a notification: *"Connecting to secure channel..."*.
4. **Zero Persistent Storage on Disconnect**:
   - When a connection drops, existing messages stay only in ephemeral React state for that view.
   - If the user reloads the browser, all past messages are gone forever (as per zero-retention architecture).
