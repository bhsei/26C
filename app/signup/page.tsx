import Link from "next/link";
import { redirect } from "next/navigation";
import { signUp } from "@/app/auth-actions";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const errors: Record<string, string> = {
  details: "Enter your name and a valid email address.",
  password: "Choose a password with at least 8 characters.",
  match: "The passwords do not match.",
  exists: "An account with that email already exists.",
};

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await getCurrentUser();
  if (user) redirect(user.role === "SUPERVISOR" ? "/merchant" : "/student");
  const params = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-blue-50 px-4 py-12 font-sans text-blue-950">
      <section className="w-full max-w-md space-y-6 rounded-2xl border border-blue-100 bg-white p-8 shadow-sm">
        <header className="space-y-2 text-center"><p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">SecondHelping</p><h1 className="text-3xl font-bold">Create your account</h1><p className="text-sm text-blue-700">Sign up as a student to discover discounted meals.</p></header>
        {params.error && errors[params.error] && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{errors[params.error]}</p>}
        <form action={signUp} className="space-y-4">
          <label className="block space-y-1 text-sm font-medium">Name<input name="name" autoComplete="name" required className="w-full rounded-lg border border-blue-200 p-3 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label>
          <label className="block space-y-1 text-sm font-medium">Email<input name="email" type="email" autoComplete="email" required className="w-full rounded-lg border border-blue-200 p-3 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label>
          <label className="block space-y-1 text-sm font-medium">Password<input name="password" type="password" autoComplete="new-password" minLength={8} required className="w-full rounded-lg border border-blue-200 p-3 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label>
          <label className="block space-y-1 text-sm font-medium">Confirm password<input name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required className="w-full rounded-lg border border-blue-200 p-3 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label>
          <button type="submit" className="w-full rounded-lg bg-blue-700 px-4 py-3 font-semibold text-white transition hover:bg-blue-800">Create account</button>
        </form>
        <p className="text-center text-sm text-blue-700">Already have an account? <Link href="/" className="font-semibold text-blue-800 underline">Log in</Link></p>
      </section>
    </main>
  );
}
