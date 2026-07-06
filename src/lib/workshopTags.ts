const WORKSHOP_TAGS = ["WORKSHOP", "IYOCA", "TALK"] as const;

type WorkshopTag = (typeof WORKSHOP_TAGS)[number];

function isWorkshopTag(tag: string): tag is WorkshopTag {
  return (WORKSHOP_TAGS as readonly string[]).includes(tag);
}

export function getWorkshopTags(tags: unknown) {
  if (!Array.isArray(tags)) return ["WORKSHOP"];

  const normalizedTags = tags
    .map((tag) => (typeof tag === "string" ? tag.trim().toUpperCase() : ""))
    .filter(isWorkshopTag);

  return normalizedTags.length > 0 ? Array.from(new Set(normalizedTags)) : ["WORKSHOP"];
}

export function getWorkshopTagColor(tag: string) {
  const normalizedTag = tag.toUpperCase().trim();

  if (normalizedTag === "WORKSHOP") return "yellow";
  if (normalizedTag === "IYOCA") return "green";
  if (normalizedTag === "TALK") return "blue";

  return "yellow";
}
