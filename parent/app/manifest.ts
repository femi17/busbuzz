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
      // Scalable brand mark — installable on Android & iOS.
      // TODO(production): add rasterised 192/512 PNGs + a maskable variant.
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
