import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { getWorkshopPath } from "@/lib/workshopRoutes";
import { getPublishedWorkshopsForSitemap } from "@/sanity/workshops";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const workshops = await getPublishedWorkshopsForSitemap();
  const workshopEntries: MetadataRoute.Sitemap = workshops.flatMap((workshop) => {
    const path = getWorkshopPath(workshop);
    if (!path || workshop.seo?.noindex) return [];

    return [
      {
        url: `${SITE_URL}${path}`,
        lastModified: workshop._updatedAt ? new Date(workshop._updatedAt) : new Date(),
        changeFrequency: "monthly",
        priority: 0.8,
      },
    ];
  });

  return [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    ...workshopEntries,
  ];
}
