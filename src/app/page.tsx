"use client";

import { useState, FormEvent } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError("Enter your email and password to continue.");
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: email.trim(), password }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(
          (data as { message?: string }).message ||
            "Invalid email or password."
        );
        setIsSubmitting(false);
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setError(
        "Couldn't reach the server. Check your connection and try again."
      );
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen w-full flex-col bg-white lg:flex-row">
      {/* Brand panel — hidden on small screens */}
      <div className="relative hidden w-full flex-col justify-between overflow-hidden bg-black px-12 py-12 lg:flex lg:w-1/2 xl:px-20">
        <svg
          className="pointer-events-none absolute -bottom-24 -right-24 h-[520px] w-[520px] opacity-[0.12]"
          viewBox="0 0 200 200"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M20 20 L180 180"
            stroke="#17D65D"
            strokeWidth="26"
            strokeLinecap="round"
          />
          <path
            d="M20 180 L180 20"
            stroke="#17D65D"
            strokeWidth="26"
            strokeLinecap="round"
          />
        </svg>

        <Image
          src="/technox-logo-white.png"
          alt="TechnoX"
          width={220}
          height={60}
          className="relative w-44 xl:w-52"
          priority
        />

        <div className="relative max-w-sm">
          <p className="text-2xl font-medium leading-snug text-white xl:text-3xl">
            Manage your storesssssss with technoxxxxxxxxxxxxxxxxxxxxxx, orders and inventory from one place.
          </p>
          <p className="mt-4 text-sm text-white/50">
            Laptops &amp; smart devices, sorted.
          </p>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex w-full flex-1 flex-col justify-center px-6 py-12 sm:px-10 lg:w-1/2 lg:px-16 xl:px-24">
        <div className="mb-10 flex justify-center lg:hidden">
          <Image
            src="/technox-logo-black.png"
            alt="TechnoX"
            width={180}
            height={48}
            className="w-40"
            priority
          />
        </div>

        <div className="mx-auto w-full max-w-sm">
          <h1 className="text-2xl font-semibold text-black sm:text-3xl">
            Sign in
          </h1>
          <p className="mt-2 text-sm text-neutral-500">
            Enter your account details to continue.
          </p>

          <form
            onSubmit={handleSubmit}
            className="mt-8 flex flex-col gap-5"
            noValidate
          >
            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-sm font-medium text-black">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-lg border border-neutral-300 bg-white px-4 py-3 text-sm text-black outline-none transition focus:border-[#17D65D] focus:ring-2 focus:ring-[#17D65D]/30"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="password"
                  className="text-sm font-medium text-black"
                >
                  Password
                </label>
              </div>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-lg border border-neutral-300 bg-white px-4 py-3 pr-16 text-sm text-black outline-none transition focus:border-[#17D65D] focus:ring-2 focus:ring-[#17D65D]/30"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 flex items-center px-4 text-xs font-medium text-neutral-500 hover:text-black"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            {error && (
              <div
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-2 flex w-full items-center justify-center rounded-lg bg-[#17D65D] px-4 py-3 text-sm font-semibold text-black transition hover:bg-[#12b84e] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
