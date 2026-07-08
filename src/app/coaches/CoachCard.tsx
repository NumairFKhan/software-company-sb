import Image from "next/image";
import Link from "next/link";
import type { CoachWithDistance } from "@/lib/searchCoaches";

interface CoachCardProps {
  coach: CoachWithDistance;
}

export default function CoachCard({ coach }: CoachCardProps) {
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl bg-white shadow-md hover:shadow-lg transition-shadow">
      {/* Photo strip */}
      <div className="relative h-36 bg-gradient-to-br from-blue-400 to-indigo-600">
        {coach.photo_url ? (
          <Image
            src={coach.photo_url}
            alt={`${coach.full_name} profile photo`}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-5xl text-white/60">
            👤
          </div>
        )}
      </div>

      {/* Card body */}
      <div className="flex flex-1 flex-col p-4">
        {/* Name */}
        <h3 className="text-base font-bold text-gray-900 truncate">
          {coach.full_name}
        </h3>

        {/* Sport badge */}
        {coach.sport && (
          <span className="mt-1 inline-block self-start rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
            {coach.sport}
          </span>
        )}

        {/* Rate & distance */}
        <div className="mt-2 flex items-center justify-between text-sm">
          {coach.hourly_rate !== null ? (
            <span className="font-semibold text-blue-600">
              ${Number(coach.hourly_rate).toFixed(0)}/hr
            </span>
          ) : (
            <span className="text-gray-400 italic">Rate TBD</span>
          )}
          <span className="text-gray-500">~{coach.distance} mi away</span>
        </div>

        {/* CTA */}
        <div className="mt-auto pt-3">
          <Link
            href={`/coaches/${coach.id}`}
            className="block w-full rounded-lg bg-blue-600 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
          >
            Book a lesson
          </Link>
        </div>
      </div>
    </div>
  );
}
