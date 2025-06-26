"use client";
import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";
import { supabase } from "~/utils/supabaseClient";

export default function AuthUI() {
  const handleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${process.env.NEXT_PUBLIC_BASE_URL}/auth/callback`,
        scopes: 'https://www.googleapis.com/auth/calendar.readonly openid profile email',
      },
    });
  };

  return (
    <div className="flex h-fit w-fit items-center justify-center">
      <button
        onClick={handleLogin}
        className="w-full py-2 px-4 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
      >
        Sign in with Google
      </button>
    </div>
  );
} 