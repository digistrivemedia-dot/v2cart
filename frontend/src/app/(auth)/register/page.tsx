"use client";

import { PasswordInput } from "@/components/ui/form/PasswordInput";
import Link from "next/link";
import { FaGoogle } from "react-icons/fa6";
import { MdError } from "react-icons/md";
import { useAuthMutation } from "@/hooks/auth";
import { FormEvent, useRef, useState } from "react";

type AccountType = "customer" | "vendor";

const inputClass =
  "w-full px-4 py-2.5 bg-black/40 border border-zinc-700 rounded-xl text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500/50 transition-all duration-200 font-light text-sm";
const labelClass = "text-xs font-medium text-zinc-400 tracking-wider uppercase ml-1";

const Register = () => {
  const { signUp, signInWithGoogle } = useAuthMutation();

  const [accountType, setAccountType] = useState<AccountType>("customer");

  const nameRef = useRef<HTMLInputElement>(null!);
  const emailRef = useRef<HTMLInputElement>(null!);
  const passwordRef = useRef<HTMLInputElement>(null!);
  const genderRef = useRef<HTMLSelectElement>(null!);
  const businessNameRef = useRef<HTMLInputElement>(null!);
  const gstNumberRef = useRef<HTMLInputElement>(null!);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    signUp.mutate({
      email: emailRef.current.value,
      password: passwordRef.current.value,
      name: nameRef.current.value,
      gender: genderRef.current.value,
      role: accountType === "customer" ? undefined : accountType,
      vendorProfile: accountType === "vendor"
        ? { businessName: businessNameRef.current?.value, gstNumber: gstNumberRef.current?.value }
        : undefined,
    });
  };

  const error = signUp.error || signInWithGoogle.error;
  const isLoading = signUp.isPending || signInWithGoogle.isPending;

  return (
    <section className="fixed inset-0 overflow-y-auto bg-black px-4 py-4 flex items-center justify-center">
      {/* Background Elements — fixed so they never scroll away and reveal anything beneath */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -left-32 w-96 h-96 bg-orange-500/[0.06] rounded-full blur-3xl"></div>
        <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-white/[0.03] rounded-full blur-3xl"></div>
      </div>

      <div className="w-full max-w-2xl relative z-10 py-2">
        {/* Header */}
        <div className="text-center mb-4">
          <h1 className="text-2xl md:text-3xl font-light text-white mb-1 tracking-wide">
            Create Account
          </h1>
          <p className="text-gray-500 text-xs font-light tracking-wide">Join us and start exploring</p>
        </div>

        {/* Form Card */}
        <div className="relative">
          {/* Edge glow — gives the card a visible boundary against the black page */}
          <div className="absolute -inset-[1px] bg-gradient-to-b from-zinc-600/60 via-zinc-700/30 to-zinc-800/20 rounded-2xl"></div>

          <div className="relative bg-zinc-900 rounded-2xl p-5 md:p-7 border border-zinc-700 shadow-2xl shadow-black/60">
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="bg-red-950/20 border border-red-900/30 rounded-xl p-3 flex items-start gap-3 animate-shake">
                  <MdError className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-red-300 font-light">
                    {error instanceof Error
                      ? error.message
                      : "Error creating account"}
                  </div>
                </div>
              )}

              {/* Account Type */}
              <div className="space-y-1.5">
                <label className={labelClass}>Account Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { value: "customer", label: "Customer" },
                    { value: "vendor", label: "Vendor" },
                  ] as const).map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setAccountType(option.value)}
                      disabled={isLoading}
                      className={`py-2 rounded-xl text-sm font-light border transition-all duration-200 ${
                        accountType === option.value
                          ? "bg-white text-black border-white"
                          : "bg-black/40 text-zinc-400 border-zinc-700 hover:border-zinc-500"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                {accountType === "vendor" && (
                  <p className="text-xs text-zinc-500 mt-1 font-light ml-1">
                    Vendor accounts need admin approval before you can list products.
                  </p>
                )}
              </div>

              {/* Name + Email — side by side */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className={labelClass}>Full Name</label>
                  <input
                    type="text"
                    ref={nameRef}
                    required
                    placeholder="John Doe"
                    className={inputClass}
                    name="name"
                    disabled={isLoading}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className={labelClass}>Email Address</label>
                  <input
                    type="email"
                    ref={emailRef}
                    required
                    placeholder="name@example.com"
                    className={inputClass}
                    name="email"
                    disabled={isLoading}
                  />
                </div>
              </div>

              {/* Business Name + GST — side by side, vendor only */}
              {accountType === "vendor" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className={labelClass}>Business Name</label>
                    <input
                      type="text"
                      ref={businessNameRef}
                      required
                      placeholder="Your business name"
                      className={inputClass}
                      name="businessName"
                      disabled={isLoading}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className={labelClass}>GST Number (optional)</label>
                    <input
                      type="text"
                      ref={gstNumberRef}
                      placeholder="GSTIN"
                      className={inputClass}
                      name="gstNumber"
                      disabled={isLoading}
                    />
                  </div>
                </div>
              )}

              {/* Gender + Password — side by side */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className={labelClass}>Gender</label>
                  <div className="relative">
                    <select
                      ref={genderRef}
                      required
                      className={`${inputClass} appearance-none`}
                      name="gender"
                      disabled={isLoading}
                    >
                      <option value="" className="bg-zinc-900 text-gray-500">Select gender</option>
                      <option value="male" className="bg-zinc-900">Male</option>
                      <option value="female" className="bg-zinc-900">Female</option>
                      <option value="other" className="bg-zinc-900">Other</option>
                    </select>
                    <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none text-zinc-500">
                      <svg className="w-4 h-4 fill-current" viewBox="0 0 20 20">
                        <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" fillRule="evenodd"></path>
                      </svg>
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className={labelClass}>Password</label>
                  <PasswordInput
                    ref={passwordRef}
                    name="password"
                    required
                    disabled={isLoading}
                    placeholder="Create a password"
                    className="w-full px-4 py-2.5 bg-black/40 border border-zinc-700 rounded-xl text-white focus-within:border-zinc-500 focus-within:ring-1 focus-within:ring-zinc-500/50 transition-all duration-200 font-light text-sm"
                  />
                </div>
              </div>
              <p className="text-xs text-zinc-500 -mt-2 font-light ml-1">Password must be at least 8 characters long</p>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-white text-black font-medium py-2.5 px-6 rounded-xl hover:bg-gray-100 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? "Creating account..." : "Create Account"}
              </button>

              <div className="relative flex items-center justify-center py-2">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-zinc-700"></div>
                </div>
                <div className="relative bg-zinc-900 px-4">
                  <span className="text-xs text-gray-600 font-light tracking-wide">OR</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => signInWithGoogle.mutate()}
                disabled={signInWithGoogle.isPending}
                className="w-full flex items-center justify-center gap-3 px-4 py-2.5 bg-black/30 border border-zinc-700 text-gray-300 font-light rounded-xl hover:bg-black/50 hover:border-zinc-500 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                <FaGoogle className="w-4 h-4" />
                Continue with Google
              </button>
            </form>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-4">
          <p className="text-gray-500 text-sm font-light">
            Already have an account?{" "}
            <Link
              href="/login"
              className="text-white hover:text-gray-300 transition-colors font-normal"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>

      <style jsx>{`
        @keyframes shake {
          0%, 100% {
            transform: translateX(0);
          }
          25% {
            transform: translateX(-5px);
          }
          75% {
            transform: translateX(5px);
          }
        }

        .animate-shake {
          animation: shake 0.5s ease-in-out;
        }
      `}</style>
    </section>
  );
};

export default Register;
