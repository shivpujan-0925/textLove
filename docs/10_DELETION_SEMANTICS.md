# textLove - Deletion Semantics & Technical Limitations

## 1. "Delete for Both" Semantics

The "Delete for Both" feature allows either participant in an active conversation to immediately and irreversibly terminate the conversation and trigger a synchronous purge on both connected devices.

### 1.1 Execution Flow

```
[Alice Clicks "End & Delete Conversation"]
                 |
                 v
[Client Alice emits Socket: conv:delete_for_both { conversationId }]
                 |
                 v
[Backend Validation]:
  1. Authenticate Alice's socket session.
  2. Verify Alice is an authorized participant in conversationId.
  3. Verify conversation status == 'active'.
                 |
                 v
[Backend State Teardown]:
  1. Update MongoDB ActiveConversation status to 'closed'.
  2. Disband Socket.IO room for conversationId.
  3. Emit 'conv:deleted' { initiator: "alice", conversationId } to room.
  4. Schedule purge of conversation metadata from MongoDB.
                 |
        +--------+--------+
        |                 |
        v                 v
[Client Alice]      [Client Bob]
  - Wipe message      - Wipe message array
    array from RAM      from RAM
  - Clear session     - Clear session keys
    keys              - Unmount chat UI
  - Unmount chat UI   - Display notice:
  - Transition to       "Conversation ended
    home screen         by Alice"
```

### 1.2 Protection Against Stale Events & Race Conditions
- Once `status` transitions to `closed`, any pending or in-flight `msg:send` frame matching that `conversationId` is rejected with `CONVERSATION_CLOSED`.
- Even if a stale network packet arrives at the server microseconds later, the server checks the room status and drops it with zero processing.

---

## 2. User-Controlled Account Deletion

When a user selects **"Delete My Account"** under profile settings, the system executes an exhaustive multi-stage purge:

```
[User triggers DELETE /api/v1/users/me]
                   |
                   v
[Stage 1: Soft-Disable & Session Invalidation]
  - Mark User.status = 'deleted'
  - Immediately delete all active records in `sessions` collection
  - Invalidate all active WebSockets associated with userId in ConnectionRegistry
                   |
                   v
[Stage 2: Active Conversations Purge]
  - Query all ActiveConversations where participantA == userId OR participantB == userId
  - For each conversation: emit 'conv:deleted' to peer and mark 'closed'
                   |
                   v
[Stage 3: Cloudinary Media Cleanup]
  - If user has an avatarPublicId:
    Call Cloudinary Admin API: `cloudinary.v2.uploader.destroy(avatarPublicId)`
                   |
                   v
[Stage 4: Permanent Metadata Purge]
  - Delete User record from MongoDB (or wipe all identifiable attributes: email, Google ID, username, public key bundle)
  - Release username for recycling or reserve to prevent impersonation based on policy
  - Clear textlove_session cookie via HTTP response headers
```

---

## 3. Honest Technical Limitations & Edge Cases

In the interest of rigorous application security, textLove acknowledges the following physical and software limitations inherent to web browsers:

### 3.1 JavaScript V8 Memory Management & Garbage Collection
- In high-level garbage-collected runtimes like Google Chrome's V8 or Mozilla's SpiderMonkey, raw JavaScript strings and objects cannot be guaranteed zeroed out at the silicon/hardware register level.
- When textLove executes `messages = []`, the references are unlinked and become eligible for garbage collection (`GC`), but raw byte remnants may persist in process memory pages until the browser OS process reallocates or frees those pages.
- **Mitigation**: We use Web Crypto API `CryptoKey` objects with `extractable: false` where possible, and avoid keeping long-lived string copies across closures.

### 3.2 Screen Captures & Operating System Inspection
- **No Browser Screenshot Prevention**: There is no standard Web API that reliably prevents an operating system tool, third-party screen recorder, browser extension, or mobile device screenshot utility from capturing rendered canvas or DOM pixels.
- **Physical Cameras**: No cryptographic system can prevent a user from photographing a screen with a smartphone or external camera.
- **Compromised Endpoints**: End-to-end encryption guarantees data confidentiality and integrity in transit. If an endpoint device is infected with spyware, keyloggers, or a rogue browser extension, plaintext displayed in the DOM can be compromised at the endpoint.

### 3.3 Ephemeral Buffer Reality
- Network transit requires ciphertext bytes to occupy kernel socket buffers and Node.js stream buffers for fractions of a millisecond. textLove ensures zero *intentional* persistence (no writes to disk, database, queues, or logs).
