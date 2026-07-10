/** @type {import('next').NextConfig} */
const nextConfig = {
  // React Strict Mode double-invokes effects in dev (mount -> cleanup ->
  // mount) to surface side-effect bugs. That's fine for cheap effects, but
  // each WS connection to /ws/communicator spins up a real, several-second
  // Claude Agent SDK session server-side — the double-mount was opening and
  // immediately tearing down a real Communicator session on every page
  // load, which is what made the chat panel feel unresponsive. Disabled
  // for this app; this only affects `next dev`, never production builds.
  reactStrictMode: false,
};

export default nextConfig;
