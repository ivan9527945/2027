import type { MetadataRoute } from "next";
import { elements } from "@/lib/content";
import { SITE_URL } from "@/lib/site";

// sitemap.xml：首頁、文字版、圖案總表，以及 117 個圖案頁
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "monthly", priority: 1 },
    { url: `${SITE_URL}/story`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE_URL}/elements`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    ...elements.map((e) => ({ url: `${SITE_URL}/elements/${e.id}`, lastModified: now, changeFrequency: "yearly" as const, priority: 0.6 })),
  ];
}
