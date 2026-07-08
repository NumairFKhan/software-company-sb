"use client";

/**
 * /onboarding — Coach profile completion form.
 *
 * Collects:
 *  - Display name (full_name)
 *  - Bio (max 500 chars)
 *  - Hourly rate
 *  - Zip code (geocoded server-side)
 *  - Profile photo (uploaded directly to Supabase Storage)
 *
 * On submit:
 *  1. Uploads photo to Supabase Storage (coach-photos/{user_id}/avatar.<ext>)
 *  2. POSTs profile data + photo_url to /api/coaches
 *  3. Redirects to /api/coaches/stripe-connect for Stripe Express onboarding
 */
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export default function OnboardingPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [hourlyRate, setHourlyRate] = useState("");
  const [zip, setZip] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  // Stripe-related query param messages
  const [stripeMessage, setStripeMessage] = useState<string | null>(null);

  useEffect(() => {
    // Read query param on mount (can't use useSearchParams without Suspense in Next 14)
    const params = new URLSearchParams(window.location.search);
    if (params.get("stripe_incomplete")) {
      setStripeMessage(
        "Your Stripe setup was not completed. Please finish it to go live."
      );
    }
    if (params.get("stripe_error")) {
      setStripeMessage(
        "Something went wrong with Stripe Connect. Please try again."
      );
    }

    // Fetch current user for storage path
    const supabase = getSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data: authData }: { data: { user: { id: string } | null } }) => {
      if (authData.user) {
        setUserId(authData.user.id);
        // Pre-fill display name from the coach row if available
        supabase
          .from("coaches")
          .select("full_name, bio, hourly_rate, zip")
          .eq("user_id", authData.user.id)
          .single()
          .then(({ data: coach }: { data: { full_name?: string; bio?: string; hourly_rate?: number | null; zip?: string | null } | null }) => {
            if (coach) {
              if (coach.full_name) setDisplayName(coach.full_name);
              if (coach.bio) setBio(coach.bio);
              if (coach.hourly_rate) setHourlyRate(String(coach.hourly_rate));
              if (coach.zip) setZip(coach.zip);
            }
          });
      } else {
        router.replace("/login");
      }
    });
  }, [router]);

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    const objectUrl = URL.createObjectURL(file);
    setPhotoPreview(objectUrl);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!userId) {
      setError("You must be signed in to complete your profile.");
      return;
    }

    setLoading(true);

    try {
      let photoUrl: string | undefined;

      // --- Step 1: Upload photo to Supabase Storage (if selected) ---
      if (photoFile) {
        const supabase = getSupabaseBrowserClient();
        const ext = photoFile.name.split(".").pop() ?? "jpg";
        const storagePath = `${userId}/avatar.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from("coach-photos")
          .upload(storagePath, photoFile, { upsert: true });

        if (uploadError) {
          throw new Error(`Photo upload failed: ${uploadError.message}`);
        }

        const { data: urlData } = supabase.storage
          .from("coach-photos")
          .getPublicUrl(storagePath);

        photoUrl = urlData.publicUrl;
      }

      // --- Step 2: Save profile via POST /api/coaches ---
      const payload: Record<string, unknown> = {
        display_name: displayName,
        bio,
        hourly_rate: hourlyRate ? parseFloat(hourlyRate) : undefined,
        zip: zip || undefined,
      };
      if (photoUrl) payload.photo_url = photoUrl;

      const res = await fetch("/api/coaches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? "Failed to save profile");
      }

      // --- Step 3: Redirect to Stripe Connect onboarding ---
      window.location.href = "/api/coaches/stripe-connect";
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-md">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">
            Complete your coach profile
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Tell players about yourself. You&apos;ll connect Stripe next to
            receive payments.
          </p>
        </div>

        {stripeMessage && (
          <div className="mb-4 rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
            {stripeMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Profile photo */}
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Profile photo
            </label>
            <div className="mt-1 flex items-center gap-4">
              <div className="relative h-16 w-16 overflow-hidden rounded-full bg-gray-100">
                {photoPreview ? (
                  <Image
                    src={photoPreview}
                    alt="Profile preview"
                    fill
                    className="object-cover"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-2xl text-gray-400">
                    👤
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              >
                {photoFile ? "Change photo" : "Upload photo"}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePhotoChange}
                data-testid="photo-input"
              />
            </div>
          </div>

          {/* Display name */}
          <div>
            <label
              htmlFor="display_name"
              className="block text-sm font-medium text-gray-700"
            >
              Display name <span className="text-red-500">*</span>
            </label>
            <input
              id="display_name"
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Alex Rivera"
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Bio */}
          <div>
            <label
              htmlFor="bio"
              className="block text-sm font-medium text-gray-700"
            >
              Bio{" "}
              <span className="text-gray-400">
                ({bio.length}/500)
              </span>
            </label>
            <textarea
              id="bio"
              rows={4}
              maxLength={500}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell players about your coaching style, experience, and specialties…"
              className="mt-1 block w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Hourly rate */}
          <div>
            <label
              htmlFor="hourly_rate"
              className="block text-sm font-medium text-gray-700"
            >
              Hourly rate (USD)
            </label>
            <div className="mt-1 flex items-center gap-1">
              <span className="text-sm text-gray-500">$</span>
              <input
                id="hourly_rate"
                type="number"
                min="0"
                step="0.01"
                value={hourlyRate}
                onChange={(e) => setHourlyRate(e.target.value)}
                placeholder="75.00"
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Zip code */}
          <div>
            <label
              htmlFor="zip"
              className="block text-sm font-medium text-gray-700"
            >
              Zip code
            </label>
            <input
              id="zip"
              type="text"
              pattern="[0-9]{5}(-[0-9]{4})?"
              value={zip}
              onChange={(e) => setZip(e.target.value)}
              placeholder="10001"
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <p className="mt-1 text-xs text-gray-400">
              Used to show your location to players searching nearby.
            </p>
          </div>

          {error && (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !displayName}
            className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading
              ? "Saving…"
              : "Save profile & set up payments →"}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-gray-400">
          After saving you&apos;ll be taken to Stripe to complete identity
          verification and connect your bank account.
        </p>
      </div>
    </main>
  );
}
