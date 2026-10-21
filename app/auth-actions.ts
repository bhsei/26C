"use server";

import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { createSession, signOutCurrentUser, isSupervisorRole } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/password";

// Handles the login process for existing users
export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    redirect("/login?error=invalid");
  }

  if (!user.passwordHash.startsWith("scrypt$")) {
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(password) } });
  }

  await createSession(user.id);
  const requested = String(formData.get("next") ?? "");
  const allowed = requested.startsWith("/") && !requested.startsWith("//") &&
    (!isSupervisorRole(user.role) || !["/merchant", "/impact"].includes(requested))
    ? true
    : !!requested;
  const roleRedirect = isSupervisorRole(user.role) ? "/merchant" : "/orders";
  redirect(allowed ? requested : roleRedirect);
}

// Handles the signup process for new users
export async function signUp(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!name || !/^\S+@\S+\.\S+$/.test(email)) redirect("/signup?error=details");
  if (password.length < 8) redirect("/signup?error=password");
  if (password !== confirmPassword) redirect("/signup?error=match");

  let user: { id: string; role: "STUDENT" | "OWNER" | "MODERATOR" };
  try {
    user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash: await hashPassword(password),
        role: "STUDENT",
      },
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      redirect("/signup?error=exists");
    }
    throw error;
  }

  await createSession(user.id);
  redirect("/orders");
}

// Handles the logout process for the current user
export async function logout() {
  await signOutCurrentUser();
  redirect("/");
}
