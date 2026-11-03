/**
 * Optional sign-in. Scanning never requires it; signing in attaches reports to you so
 * /me can list them. Google only, JWT sessions (no database), so the only config is:
 *   AUTH_SECRET          openssl rand -base64 32
 *   AUTH_GOOGLE_ID       from Google Cloud Console → OAuth client
 *   AUTH_GOOGLE_SECRET
 * Without these, the sign-in link is hidden and everything else works as before.
 */
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

export const authEnabled = !!(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET && process.env.AUTH_SECRET);

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: authEnabled ? [Google] : [],
  session: { strategy: "jwt" },
  trustHost: true,
  callbacks: {
    jwt({ token, profile }) {
      if (profile?.sub) token.uid = `g:${profile.sub}`;
      return token;
    },
    session({ session, token }) {
      (session.user as { id?: string }).id = (token.uid as string) || "";
      return session;
    },
  },
});

/** Stable user id for storage keys, or null when signed out / auth disabled. */
export async function currentUserId(): Promise<string | null> {
  if (!authEnabled) return null;
  const s = await auth().catch(() => null);
  return ((s?.user as { id?: string } | undefined)?.id) || null;
}
