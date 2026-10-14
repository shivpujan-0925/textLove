# textLove — 100% Free Production Deployment Guide

Deploy a fully functional, production-ready instance of **textLove** using free cloud tiers:

| Component | Platform | Free Tier Specifications | Role |
| :--- | :--- | :--- | :--- |
| **Frontend PWA** | [Vercel](https://vercel.com/) | 100 GB Bandwidth, Global CDN, SSL | Serves React SPA & Service Worker |
| **Realtime Gateway** | [Render](https://render.com/) | 750 free instance hours / month, Native WebSockets | Runs Node.js, Express & Socket.IO |
| **Database** | [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) | M0 Cluster (512 MB Storage, Shared RAM) | Stores User Accounts & Public Prekeys only |
| **Avatar Storage** | [Cloudinary](https://cloudinary.com/) | 25 Credits / month (~25,000 transformations) | Hosts profile avatars securely |

---

## Architecture Topology in Production

```
                                [ User Browser / PWA ]
                                           │
                         ┌─────────────────┴─────────────────┐
                         ▼                                   ▼
                [ Vercel CDN ]                      [ Render Gateway ]
              HTTPS (Frontend PWA)                WSS (WebSocket Engine)
                         │                                   │
                         │                                   ├─► [ MongoDB Atlas M0 ]
                         │                                   │   (Users & Public Prekeys)
                         │                                   │
                         └───────────────────────────────────┴─► [ Cloudinary ]
                                                                 (Profile Avatars)
```

---

## 1. MongoDB Atlas Setup (M0 Free Cluster)

1. Sign up or log into [MongoDB Atlas](https://cloud.mongodb.com/).
2. Click **Create Deployment** and select the **M0 Free Tier** (AWS, choose closest region to your users).
3. Under **Database Access**, create a database user:
   - Username: `textlove_admin`
   - Password: Generate a strong 24-character password.
   - Built-in Role: `Read and write to any database`.
4. Under **Network Access**, add an IP Access List entry:
   - Address: `0.0.0.0/0` (Allows Render dynamic cloud IPs to connect).
5. Click **Connect** -> **Drivers** -> Copy the connection string:
   ```
   mongodb+srv://textlove_admin:<PASSWORD>@cluster0.xxxxx.mongodb.net/textlove?retryWrites=true&w=majority&tls=true
   ```

> [!NOTE]
> MongoDB stores only user credentials, profile links, and public cryptographic prekey bundles. Messages are **never** persisted.

---

## 2. Cloudinary Setup (Free Avatar Hosting)

1. Register at [Cloudinary](https://cloudinary.com/).
2. On your Cloudinary Dashboard, note down:
   - **Cloud Name** (e.g. `textlove-app`)
   - **API Key** (e.g. `987654321098765`)
   - **API Secret** (e.g. `AbCdEf123456789`)

---

## 3. Google OAuth 2.0 Credentials Setup

1. Open the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project: `textLove-Production`.
3. Configure the **OAuth Consent Screen**:
   - User Type: **External**
   - App Name: `textLove`
   - User Support Email: your email
   - Scopes: `.../auth/userinfo.profile`, `.../auth/userinfo.email`
4. Create Credentials -> **OAuth Client ID**:
   - Application Type: **Web Application**
   - Name: `textLove Production Client`
   - **Authorized JavaScript Origins**:
     - `https://your-frontend.vercel.app`
   - **Authorized Redirect URIs**:
     - `https://your-backend.onrender.com/api/auth/google/callback`
5. Copy your **Client ID** and **Client Secret**.

---

## 4. Backend Deployment (Render Free Web Service)

1. Push your code to GitHub (ensure repo is updated).
2. Go to [Render Dashboard](https://dashboard.render.com/) -> Click **New +** -> **Web Service**.
3. Connect your GitHub repository (`shivpujan-0925/textLove`).
4. Configure service settings:
   - **Name**: `textlove-backend`
   - **Region**: Closest to your MongoDB Atlas cluster.
   - **Root Directory**: `server`
   - **Environment**: `Node`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm run start`
   - **Plan Type**: **Free**
5. Add **Environment Variables**:

| Variable | Recommended Production Value |
| :--- | :--- |
| `NODE_ENV` | `production` |
| `PORT` | `4000` |
| `CORS_ORIGIN` | `https://your-frontend.vercel.app` *(update after step 5)* |
| `MONGODB_URI` | `mongodb+srv://textlove_admin:...@cluster0.mongodb.net/textlove?retryWrites=true&w=majority` |
| `JWT_SECRET` | *(Generate a 64-char hex string: `openssl rand -hex 32`)* |
| `GOOGLE_CLIENT_ID` | `your-google-client-id.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | `your-google-client-secret` |
| `GOOGLE_CALLBACK_URL` | `https://textlove-backend.onrender.com/api/auth/google/callback` |
| `CLOUDINARY_CLOUD_NAME` | `your-cloudinary-name` |
| `CLOUDINARY_API_KEY` | `your-cloudinary-api-key` |
| `CLOUDINARY_API_SECRET` | `your-cloudinary-api-secret` |

6. Click **Deploy Web Service**.
7. Note down your backend URL (e.g. `https://textlove-backend.onrender.com`).

---

## 5. Frontend Deployment (Vercel Free Tier)

1. Open [Vercel Dashboard](https://vercel.com/) -> Click **Add New...** -> **Project**.
2. Import your GitHub repository (`shivpujan-0925/textLove`).
3. Configure project settings:
   - **Framework Preset**: `Vite`
   - **Root Directory**: `client`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. Add **Environment Variables**:

| Variable | Value |
| :--- | :--- |
| `VITE_API_URL` | `https://textlove-backend.onrender.com` |

5. Click **Deploy**.
6. Once deployed, note down your production domain (e.g. `https://textlove-frontend.vercel.app`).

> [!IMPORTANT]
> Return to Render and update `CORS_ORIGIN` with your actual Vercel URL (`https://textlove-frontend.vercel.app`). Also update the Authorized Origins in Google Cloud Console.

---

## 6. Post-Deployment Verification Checklist

- [ ] **Health Endpoint**: Visit `https://your-backend.onrender.com/api/health` and verify `{"status":"ok"}`.
- [ ] **Google Sign-In**: Navigate to your Vercel URL and sign in via Google OAuth.
- [ ] **WebSocket Handshake**: Open browser DevTools Network tab -> filter by `WS` -> verify successful WebSocket upgrade to your Render backend.
- [ ] **Two-Device E2EE Test**: Open the app in two separate private browsing windows, establish a conversation, and confirm message exchange.
- [ ] **Zero-Retention Inspection**: Open MongoDB Atlas Data Explorer and confirm no collections exist for messages or chat logs.
- [ ] **PWA Installability**: Check browser address bar for the install icon or test on mobile to install the standalone web app.
