"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../utils/supabaseClient";

export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    const storeGoogleTokens = async () => {
      const { data, error } = await supabase.auth.getSession();
      const session = data?.session;

      console.log("Session on callback:", session);

      if (error) {
        // Optionally log or handle error
        router.replace("/");
        return;
      }

      if (session?.provider_token) {
        await fetch("/api/auth/store-google-tokens", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            provider_token: session.provider_token,
            provider_refresh_token: session.provider_refresh_token,
          }),
        });
      }

      router.replace("/");
    };

    void storeGoogleTokens();
  }, [router]);

  return <div>Logging in...</div>;
} 