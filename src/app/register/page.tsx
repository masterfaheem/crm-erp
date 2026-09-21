"use client";

import { useState, FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const router = useRouter();

  const [companyName, setCompanyName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!companyName.trim() || !name.trim() || !email.trim() || !password) {
      setError("Please fill in all required fields.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          company_name: companyName.trim(),
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim() || null,
          password,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(
          (data as { message?: string }).message ||
            "Couldn't create your account. Please try again."
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
      {/* Brand panel */}
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
            Get your business running in under a minute.
          </p>
          <p className="mt-4 text-sm text-white/50">
            Free to start. No credit card required.
          </p>

          <ul className="mt-8 space-y-3 text-sm text-white/70">
            {[
              "Leads, customers, and pipeline in one place",
              "Invoices, orders, and inventory tracking",
              "Reports, permissions, and multi-branch support",
            ].map((item) => (
              <li key={item} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-[#17D65D]/15">
                  <svg
                    className="h-3 w-3 text-[#17D65D]"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={3}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
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
            Create your account
          </h1>
          <p className="mt-2 text-sm text-neutral-500">
            Set up your company workspace in a few seconds.
          </p>

          <form
            onSubmit={handleSubmit}
            className="mt-8 flex flex-col gap-5"
            noValidate
          >
            {/* Company */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="company"
                className="text-sm font-medium text-black"
              >
                Company name
              </label>
              <input
                id="company"
                name="company"
                type="text"
                autoComplete="organization"
                required
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Techno X"
                className="w-full rounded-lg border border-neutral-300 bg-white px-4 py-3 text-sm text-black outline-none transition focus:border-[#17D65D] focus:ring-2 focus:ring-[#17D65D]/30"
              />
            </div>

            {/* Name */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="name" className="text-sm font-medium text-black">
                Your name
              </label>
              <input
                id="name"
                name="name"
                type="text"
                autoComplete="name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Hammad Munir"
                className="w-full rounded-lg border border-neutral-300 bg-white px-4 py-3 text-sm text-black outline-none transition focus:border-[#17D65D] focus:ring-2 focus:ring-[#17D65D]/30"
              />
            </div>

            {/* Email + Phone (2-col on sm+) */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="email"
                  className="text-sm font-medium text-black"
                >
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
                  placeholder="you@company.com"
                  className="w-full rounded-lg border border-neutral-300 bg-white px-4 py-3 text-sm text-black outline-none transition focus:border-[#17D65D] focus:ring-2 focus:ring-[#17D65D]/30"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="phone"
                  className="text-sm font-medium text-black"
                >
                  Phone <span className="text-neutral-400">(optional)</span>
                </label>
                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+92 300 0000000"
                  className="w-full rounded-lg border border-neutral-300 bg-white px-4 py-3 text-sm text-black outline-none transition focus:border-[#17D65D] focus:ring-2 focus:ring-[#17D65D]/30"
                />
              </div>
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="password"
                className="text-sm font-medium text-black"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
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

            {/* Confirm password */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="confirmPassword"
                className="text-sm font-medium text-black"
              >
                Confirm password
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your password"
                className="w-full rounded-lg border border-neutral-300 bg-white px-4 py-3 text-sm text-black outline-none transition focus:border-[#17D65D] focus:ring-2 focus:ring-[#17D65D]/30"
              />
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
              {isSubmitting ? "Creating account…" : "Create account"}
            </button>

            <p className="text-center text-sm text-neutral-500">
              Already have an account?{" "}
              <Link
                href="/"
                className="font-medium text-[#0fa846] hover:text-[#0c8a3a]"
              >
                Sign in
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}