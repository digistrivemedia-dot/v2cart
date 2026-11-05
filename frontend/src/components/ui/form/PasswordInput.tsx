"use client";

import { cn } from "@/lib/utils";
import { forwardRef, useState, InputHTMLAttributes } from "react";
import { AiOutlineEye, AiOutlineEyeInvisible } from "react-icons/ai";

export const PasswordInput = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div
      className={cn(
        "flex w-full items-center relative overflow-hidden transition-all duration-200",
        className // This applies the border, bg, padding, etc. to the wrapper
      )}
    >
      <input
        {...props}
        ref={ref}
        type={showPassword ? "text" : "password"}
        className="flex-1 min-w-0 bg-transparent border-none outline-none w-full h-full text-inherit placeholder:text-gray-500 focus:ring-0 p-0"
      />
      <button
        type="button"
        onClick={() => setShowPassword(!showPassword)}
        disabled={props.disabled}
        className="ml-3 text-gray-500 hover:text-gray-300 focus:outline-none transition-colors disabled:opacity-50 flex-shrink-0"
      >
        {showPassword ? (
          <AiOutlineEye size={20} />
        ) : (
          <AiOutlineEyeInvisible size={20} />
        )}
      </button>
    </div>
  );
});

PasswordInput.displayName = "PasswordInput";
