"use client";

import { PasswordInput } from "@/components/ui/form/PasswordInput";
import Link from "next/link";
import { FaGoogle } from "react-icons/fa6";
import { MdError } from "react-icons/md";

import { useAuthMutation } from "@/hooks/auth";
import { FormEvent, useRef } from "react";
import LoadingButton from "@/components/ui/loadingButton";

const Login = () => {
  const { signIn, signInWithGoogle } = useAuthMutation();

  const emailRef = useRef<HTMLInputElement>(null!);
  const passwordRef = useRef<HTMLInputElement>(null!);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    signIn.mutate({
      email: emailRef.current.value,
      password: passwordRef.current.value,
    });
  };

  const error = signIn.error || signInWithGoogle.error;
  const isLoading = signIn.isPending || signInWithGoogle.isPending;

  return (
    <section className="fixed inset-0 overflow-y-auto bg-black px-4 py-4 flex items-center justify-center">
      {/* Background Elements — fixed so they never scroll away and reveal anything beneath */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -left-32 w-96 h-96 bg-orange-500/[0.06] rounded-full blur-3xl"></div>
        <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-white/[0.03] rounded-full blur-3xl"></div>
      </div>

      <div className="w-full max-w-md relative z-10 py-2">
        {/* Header */}
        <div className="text-center mb-4">
          <h1 className="text-2xl md:text-3xl font-light text-white mb-1 tracking-wide">
            Welcome Back
          </h1>
          <p className="text-gray-500 text-xs font-light tracking-wide">Sign in to your account</p>
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
                      : "Invalid email or password"}
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-400 tracking-wider uppercase ml-1">
                  Email Address
                </label>
                <input
                  type="email"
                  ref={emailRef}
                  placeholder="name@example.com"
                  className="w-full px-4 py-2.5 bg-black/40 border border-zinc-700 rounded-xl text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500/50 transition-all duration-200 font-light text-sm"
                  name="email"
                  required
                  disabled={isLoading}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-400 tracking-wider uppercase ml-1">
                  Password
                </label>
                <PasswordInput
                  ref={passwordRef}
                  name="password"
                  required
                  disabled={isLoading}
                  placeholder="Enter your password"
                  className="w-full px-4 py-2.5 bg-black/40 border border-zinc-700 rounded-xl text-white focus-within:border-zinc-500 focus-within:ring-1 focus-within:ring-zinc-500/50 transition-all duration-200 font-light text-sm"
                />
              </div>

              <LoadingButton
                type="submit"
                className="w-full bg-white text-black font-medium py-2.5 px-6 rounded-xl hover:bg-gray-100 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                loading={isLoading}
              >
                {isLoading ? "Signing in..." : "Sign In"}
              </LoadingButton>

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
            Don&apos;t have an account?{" "}
            <Link
              href="/register"
              className="text-white hover:text-gray-300 transition-colors font-normal"
            >
              Sign up
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

export default Login;
