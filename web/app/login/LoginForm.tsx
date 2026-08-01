"use client";

import { useActionState } from "react";
import Link from "next/link";
import { loginAction, type LoginResult } from "@/app/actions/auth";
import { BrandHeader, ErrorNote, Field, PrimaryButton, inputClass } from "@/components/ui";

export default function LoginForm() {
  const [state, formAction, pending] = useActionState<LoginResult | null, FormData>(
    loginAction,
    null
  );

  return (
    <div className="flex min-h-screen flex-col bg-brand-50">
      <header className="border-b border-brand-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <BrandHeader />
          <Link href="/" className="text-sm font-semibold text-brand-700 hover:text-brand-600">
            Home
          </Link>
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-md rounded-2xl border border-brand-200 bg-paper p-8 shadow-sm">
          <h1 className="mb-1 text-xl font-bold text-brand-700">Staff sign in</h1>
          <p className="mb-6 text-sm text-ink-soft">
            Sessions expire automatically after 15 minutes of inactivity.
          </p>
          <ErrorNote message={state && !state.ok ? state.error ?? "Sign-in failed." : null} />
          <form action={formAction} className="space-y-4">
            <Field label="Username" required>
              <input
                name="username"
                autoComplete="username"
                required
                minLength={3}
                className={inputClass}
                placeholder="e.g. reception"
              />
            </Field>
            <Field label="Password" required>
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                minLength={8}
                className={inputClass}
                placeholder="••••••••"
              />
            </Field>
            <PrimaryButton className="w-full" >
              {pending ? "Signing in…" : "Sign in"}
            </PrimaryButton>
          </form>
        </div>
      </main>
    </div>
  );
}
