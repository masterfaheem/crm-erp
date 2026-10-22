"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Navbar from "@/app/components/Navbar";
import { OrderBoard } from "./OrderBoard";

/* /dispatch — Operations: online orders from won leads */
export default function DispatchPage() {
  return (
    <Suspense fallback={null}>
      <DispatchInner />
    </Suspense>
  );
}

function DispatchInner() {
  const params = useSearchParams();
  const router = useRouter();
  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-gray-50 pt-16 lg:pl-64">
        <div className="p-4 sm:p-6 lg:p-8">
          <OrderBoard
            initialTab={params.get("status") || "pending"}
            initialSearch={params.get("search") || ""}
            onTabChange={(t) => router.replace(`/dispatch?status=${t}`)}
          />
        </div>
      </main>
    </>
  );
}
