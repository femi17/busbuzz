import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BusBuzz — School Bus Tracking",
    short_name: "BusBuzz",
    description: "Track your child's school bus in real time.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#FBF7EF",
    theme_color: "#1A1712",
    categories: ["education", "navigation", "travel"],
    icons: [
      // Rasterised set generated from public/icon.svg (app/icon.png doubles
      // as the favicon via the Next file convention, apple-icon.png covers
      // the iOS home screen).
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
