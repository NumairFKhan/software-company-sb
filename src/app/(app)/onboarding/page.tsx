import { createClient } from "@/lib/supabase/server";
import OnboardingForm from "./OnboardingForm";
import type { PlayerProfile } from "@/types/database";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Fetch existing profile so returning users see their values pre-filled
  let existingProfile: PlayerProfile | null = null;
  if (user) {
    const { data } = await supabase
      .from("player_profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    existingProfile = data;
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">
          {existingProfile ? "Edit your profile" : "Set up your profile"}
        </h1>
        <p className="mt-2 text-slate-400 text-sm">
          {existingProfile
            ? "Update your details so CourtCoach can give you the best advice."
            : "Tell us about yourself so CourtCoach can personalise every session for you."}
        </p>
      </div>

      <OnboardingForm existingProfile={existingProfile} />
    </div>
  );
}
