"use client";

/** COMPONENTS */
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import LoadingButton from "@/components/ui/loadingButton";
/** FUNCTIONALITY */
import { useSession, signOut } from "@/lib/auth/client";
import { useMutation } from "@tanstack/react-query";
import { useRef } from "react";
import { toast } from "sonner";
/** TYPES */
import type { Manager } from "@/hooks/useManager";

export default function EditProfile({ manager }: { manager: Manager }) {
  const { data: session } = useSession();

  const nameRef = useRef<HTMLInputElement>(null!);

  const { mutate: updateProfile, isPending } = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/auth/update-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: nameRef.current.value,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Error updating profile");
      }

      return response.json();
    },
    onSuccess: () => {
      toast.success("Profile updated successfully");
      // Refresh page to update user data
      window.location.reload();
    },
    onError: (error: any) => {
      toast.error(
        error.message || "An error occurred while updating your profile"
      );
    },
  });

  return (
    <Dialog open={manager.active} onOpenChange={manager.set}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>My Account</DialogTitle>
          <DialogDescription>
            {session?.user?.email || ""}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {/* User Info Display */}
          <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Name:</span>
              <span className="text-sm font-semibold">{session?.user?.name || "N/A"}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Email:</span>
              <span className="text-sm font-semibold">{session?.user?.email || "N/A"}</span>
            </div>
          </div>

          {/* Logout Button - Prominent */}
          <button
            type="button"
            onClick={async () => {
              await signOut();
              toast.success("Logged out successfully");
              window.location.href = "/";
            }}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-medium py-3 px-4 rounded-lg transition-colors"
          >
            Logout
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
