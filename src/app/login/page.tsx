"use client";
import { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "../_components/AuthProvider";
import AuthUI from "../_components/AuthUI";

function LoginPageInner() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") ?? "/";

  useEffect(() => {
    if (!loading && user) {
      router.replace(redirect);
    }
  }, [user, loading, router, redirect]);

  if (loading) return <div>Loading...</div>;
  if (user) return null;

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-100 font-sans">
      <div className="w-full max-w-md h-72 rounded-lg bg-white p-2 shadow-lg border border-gray-200 flex flex-col items-center justify-center">
        <div className="w-fit h-fit text-center text-3xl font-bold text-blue-700">Welcome to CalendarAI</div>
        <div className="mb-6 text-center text-base text-gray-600">Sign in with Google to continue</div>
        <AuthUI />
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <LoginPageInner />
    </Suspense>
  );
}