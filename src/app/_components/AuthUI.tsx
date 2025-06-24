"use client";
import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";
import { supabase } from "~/utils/supabaseClient";

export default function AuthUI() {
  return (
    <div className="flex h-fit w-fit items-center justify-center">
      <Auth
        supabaseClient={supabase}
        appearance={{ theme: ThemeSupa }}
        theme="dark"
        providers={["google"]}
        onlyThirdPartyProviders
        providerScopes={{
          google: "https://www.googleapis.com/auth/calendar.readonly openid profile email",
        }}
      />
    </div>
  );
} 