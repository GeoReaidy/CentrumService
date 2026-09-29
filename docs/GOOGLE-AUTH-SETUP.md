# Centrum Service — Google Login Setup

The code is already wired to redirect users back to:

`https://centrumservice.net/portal/auth/callback`

Complete these dashboard steps once before testing the button.

## 1. Configure Google Auth Platform

1. Open Google Cloud Console and select or create the Centrum Service project.
2. Open **Google Auth Platform**.
3. Under **Branding**, set the app name to `Centrum Service`, add the support email, logo, homepage, Privacy Policy, and Terms links.
4. Under **Audience**, choose **External**. While testing, add the Google accounts that should be allowed to sign in. Publish the app when it is ready for all customers.
5. Under **Data Access**, keep only these scopes:
   - `openid`
   - `userinfo.email`
   - `userinfo.profile`
6. Under **Clients**, create an OAuth client with type **Web application**.
7. Add these **Authorized JavaScript origins**:
   - `https://centrumservice.net`
   - `http://localhost:3000` (development only)
8. Add this exact **Authorized redirect URI**:
   - `https://zlcikwwrgdnkscfitfqg.supabase.co/auth/v1/callback`
9. Copy the Google Client ID and Client Secret.

Do not add the Centrum `/portal/auth/callback` URL as Google's redirect URI. Google returns to Supabase first; Supabase then returns to Centrum.

## 2. Enable Google in Supabase

1. Open the Supabase project.
2. Go to **Authentication → Sign In / Providers → Google**.
3. Enable Google.
4. Paste the Google Client ID and Client Secret, then save.
5. Go to **Authentication → URL Configuration**.
6. Set **Site URL** to:
   - `https://centrumservice.net`
7. Add these **Redirect URLs**:
   - `https://centrumservice.net/portal/auth/callback`
   - `http://localhost:3000/portal/auth/callback` (development only)

The Google Client Secret belongs only in Supabase. Never put it in `.env.local`, GitHub, Netlify client variables, or any `NEXT_PUBLIC_` variable.

## 3. Test

1. Deploy the patched project.
2. Open `https://centrumservice.net/portal/login` in a private browser window.
3. Select **Continue with Google** and use a Google test account.
4. Confirm that a new user opens the customer dashboard.
5. Confirm that an existing admin or manager using the same verified email opens the correct staff dashboard.
6. In Supabase **Authentication → Users**, confirm the user has a Google identity.

Supabase automatically links a Google identity to an existing verified account with the same email. Authorization still comes from `profiles.role`; Google profile metadata is not trusted for staff permissions.
