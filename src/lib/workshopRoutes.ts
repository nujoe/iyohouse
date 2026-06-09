export function getWorkshopSlug(workshop: any) {
  const slug = workshop?.slug;

  if (typeof slug === "string") return slug;
  if (typeof slug?.current === "string") return slug.current;

  return "";
}

export function getWorkshopPath(workshop: any) {
  const slug = getWorkshopSlug(workshop);

  return slug ? `/workshops/${encodeURIComponent(slug)}` : "";
}
