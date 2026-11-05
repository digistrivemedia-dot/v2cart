"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";
import { useManager } from "@/hooks/useManager";
import { TopBar } from "./TopBar";
import { MainNav } from "./MainNav";

const EditProfile = dynamic(() => import("./EditProfile"), {
  ssr: false,
});

export const Navbar = () => {
  const editProfileManager = useManager();

  return (
    <>
      {/* Phase 1: Top Bar - Logo, Blog, Contact, Icons */}
      <TopBar editProfileManager={editProfileManager} />

      {/* Phase 2: Main Navigation - Categories with Dropdowns */}
      <Suspense fallback={null}>
        <MainNav />
      </Suspense>

      {/* Edit Profile Modal */}
      <EditProfile manager={editProfileManager} />
    </>
  );
};
