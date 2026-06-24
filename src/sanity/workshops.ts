import { createClient } from "next-sanity";
import { apiVersion, dataset, projectId } from "@/sanity/env";
import type { WorkshopSeoDocument } from "@/lib/workshopSeo";

const sanityServerClient = createClient({
  projectId,
  dataset,
  apiVersion,
  useCdn: true,
});

const workshopSeoProjection = `{
  _id,
  _updatedAt,
  number,
  title,
  titleEn,
  slug,
  seo,
  poster,
  posterAlt,
  tags,
  tutor,
  tutorEn,
  tutorBio,
  tutorBioEn,
  description,
  descriptionEn,
  curriculum[]{
    ...,
    weekLabelEn,
    contentEn
  },
  schedule[]{
    ...,
    dateEn,
    timeEn,
    capacity
  },
  capacity,
  price,
  isActive,
  isClosed,
  waitlistFormUrl,
  supabase_workshop_id,
  "posterMeta": poster.asset->metadata.dimensions
}`;

export async function getPublishedWorkshopsForSeo() {
  return sanityServerClient.fetch<WorkshopSeoDocument[]>(
    `*[_type == "workshop" && isActive != false && defined(slug.current) && !(_id in path("drafts.**"))] | order(number desc) ${workshopSeoProjection}`,
    {},
    { next: { revalidate: 3600 } },
  );
}

export async function getWorkshopBySlug(slug: string) {
  return sanityServerClient.fetch<WorkshopSeoDocument | null>(
    `*[_type == "workshop" && isActive != false && slug.current == $slug && !(_id in path("drafts.**"))][0] ${workshopSeoProjection}`,
    { slug },
    { next: { revalidate: 3600 } },
  );
}

export async function getPublishedWorkshopsForSitemap() {
  try {
    return await getPublishedWorkshopsForSeo();
  } catch (error) {
    console.error("Workshop sitemap fetch failed:", error);
    return [];
  }
}
