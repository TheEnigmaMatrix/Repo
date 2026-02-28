# Gmail API – Google Cloud setup and authorization

To let students connect their Gmail and get notifications when they receive emails from chosen senders (e.g. teachers), your app must be authorized to use the **Gmail API** with **OAuth 2.0**. Follow these steps in **Google Cloud Console**.

---

## 1. Create or select a project

1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. Use the project dropdown at the top and click **New Project** (or pick an existing one).
3. Name it (e.g. “UAH IITJ”) and click **Create**.

---

## 2. Enable Gmail API

1. In the left menu go to **APIs & Services** → **Library**.
2. Search for **Gmail API** and open it.
3. Click **Enable**.

---

## 3. Configure OAuth consent screen

1. Go to **APIs & Services** → **OAuth consent screen**.
2. Choose **External** (so any Gmail user can sign in) or **Internal** (only your Google Workspace).
3. Fill in:
   - **App name**: e.g. “UAH IITJ”
   - **User support email**: your email
   - **Developer contact**: your email
4. Click **Save and Continue**.
5. **Scopes**:
   - Click **Add or Remove Scopes**.
   - Add: `https://www.googleapis.com/auth/gmail.readonly` (read-only access to Gmail).
   - Save and continue.
6. **Test users** (if app is in “Testing”):
   - Add the Gmail addresses that will be used to test (e.g. student IDs).
7. Finish the consent screen.

**Production (optional):**  
For a public app, Google may require **App Verification** for the Gmail scope. Until then you can keep the app in **Testing** and only add test users who can connect Gmail.

---

## 4. Create OAuth 2.0 credentials

1. Go to **APIs & Services** → **Credentials**.
2. Click **Create Credentials** → **OAuth client ID**.
3. **Application type**: **Web application**.
4. **Name**: e.g. “UAH Web”.
5. **Authorized redirect URIs** – add exactly:
   - Local: `http://localhost:3000/api/gmail/callback`
   - Production: `https://your-domain.com/api/gmail/callback` (replace with your real domain).
6. Click **Create**.
7. Copy the **Client ID** and **Client Secret** (you’ll put these in `.env`).

---

## 5. Environment variables

In your project root, in `.env`, add:

```env
GOOGLE_CLIENT_ID=your_client_id_here
GOOGLE_CLIENT_SECRET=your_client_secret_here
GMAIL_REDIRECT_URI=http://localhost:3000/api/gmail/callback
```

For production, set:

```env
GMAIL_REDIRECT_URI=https://your-domain.com/api/gmail/callback
BASE_URL=https://your-domain.com
```

Optional (recommended for production):

```env
GMAIL_STATE_SECRET=your_random_secret_string
```

This is used to sign the OAuth `state` parameter so callbacks are tied to the correct user.

---

## 6. Summary checklist

- [ ] Gmail API enabled in the project.
- [ ] OAuth consent screen configured (app name, scopes, test users if Testing).
- [ ] OAuth client ID created (Web application).
- [ ] Redirect URI added: `.../api/gmail/callback` (and matching in `.env`).
- [ ] `.env` has `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GMAIL_REDIRECT_URI`.

---

## 7. How it behaves for users

1. Student opens **Notices** and clicks **Connect Gmail**.
2. They are sent to Google’s sign-in and consent screen (read Gmail).
3. After approving, Google redirects to your `/api/gmail/callback` with a code.
4. Your server exchanges the code for **access** and **refresh** tokens and stores them (by user).
5. The student adds **watched senders** (e.g. `alex324@iitj.ac.in` with display name “Alex”).
6. When they click **Sync inbox now** (or when you run sync), the server uses the Gmail API to fetch recent inbox messages and creates “You received an email from Alex” notifications for messages from watched senders.
7. Unseen count is shown in the **Notice Board** badge; a popup can be shown when new email notifications appear.

---

## 8. Troubleshooting

- **“Redirect URI mismatch”**: The URI in the request must match **exactly** one of the URIs in the OAuth client (including `http` vs `https`, port, and path).
- **“Access blocked”**: Consent screen not configured or app not in Testing with the user as test user (or app not verified for production).
- **“Gmail integration not configured”**: `GOOGLE_CLIENT_ID` or `GOOGLE_CLIENT_SECRET` missing or wrong in `.env`.
- **Tokens expired**: The server uses the refresh token to get new access tokens when needed (handled in `/api/gmail/sync` and token refresh logic).
