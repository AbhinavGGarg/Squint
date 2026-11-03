import Link from "next/link";
import { auth, authEnabled, signIn, signOut } from "@/auth";

/** Server component: shows Sign in, or the user's reports + Sign out. Hidden when auth isn't configured. */
export async function HeaderAuth() {
  if (!authEnabled) return null;
  const session = await auth().catch(() => null);
  if (!session?.user) {
    return (
      <form action={async () => { "use server"; await signIn("google"); }} style={{ display: "inline" }}>
        <button type="submit" className="toggle" style={{ fontSize: 15, textDecoration: "none", color: "var(--ink-2)" }}>Sign in</button>
      </form>
    );
  }
  return (
    <>
      <Link href="/me" className="me">My reports</Link>
      <form action={async () => { "use server"; await signOut({ redirectTo: "/" }); }} style={{ display: "inline" }}>
        <button type="submit" className="toggle" style={{ fontSize: 15, textDecoration: "none", color: "var(--ink-2)" }}>Sign out</button>
      </form>
    </>
  );
}
