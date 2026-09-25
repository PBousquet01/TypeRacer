import { networkInterfaces } from "node:os";
import type { NextConfig } from "next";

// This computer's addresses on the local network (e.g. 192.168.1.23), so
// friends on the same Wi-Fi can open http://<that address>:3000.
const lanAddresses = Object.values(networkInterfaces())
  .flat()
  .filter((net) => net?.family === "IPv4" && !net.internal)
  .map((net) => net!.address);

const nextConfig: NextConfig = {
  // In dev mode Next.js blocks its scripts for visitors using any address
  // other than localhost, unless they're listed here.
  allowedDevOrigins: lanAddresses,
};

export default nextConfig;
