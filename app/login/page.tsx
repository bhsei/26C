import Link from "next/link";
import { redirect } from "next/navigation";
import { login } from "@/app/auth-actions";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const errors: Record<string, string> = {
  invalid: "Email or password is incorrect.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; registered?: string; next?: string }>;
}) {
  const user = await getCurrentUser();
  const params = await searchParams;
  if (user) redirect(user.role === "SUPERVISOR" ? "/merchant" : "/orders");

  const error = params.error ? errors[params.error] : undefined;

  return (
    <main className="flex min-h-screen items-center justify-center bg-blue-50 px-4 py-12 font-sans text-blue-950">
      <section className="w-full max-w-md space-y-6 rounded-2xl border border-blue-100 bg-white p-8 shadow-sm">
        <header className="space-y-2 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">SecondHelping</p>
          <h1 className="text-3xl font-bold">Welcome back</h1>
          <p className="text-sm text-blue-700">Sign in to find or share surplus meals.</p>
        </header>
        {params.registered && <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-800">Account created. You can sign in now.</p>}
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <form action={login} className="space-y-4">
          <input type="hidden" name="next" value={params.next ?? ""} />
          <label className="block space-y-1 text-sm font-medium">Email<input name="email" type="email" autoComplete="email" required className="w-full rounded-lg border border-blue-200 p-3 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label>
          <label className="block space-y-1 text-sm font-medium">Password<input name="password" type="password" autoComplete="current-password" required className="w-full rounded-lg border border-blue-200 p-3 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label>
          <button type="submit" className="w-full rounded-lg bg-blue-700 px-4 py-3 font-semibold text-white transition hover:bg-blue-800">Log in</button>
        </form>
        <p className="text-center text-sm text-blue-700">New to SecondHelping? <Link href="/signup" className="font-semibold text-blue-800 underline">Create an account</Link></p>
      </section>
    </main>
  );
}

