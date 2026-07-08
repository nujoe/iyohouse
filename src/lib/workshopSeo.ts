import { SITE_DESCRIPTION, SITE_NAME, SITE_OG_IMAGE, SITE_URL } from "@/lib/site";
import { getWorkshopPath } from "@/lib/workshopRoutes";
import { urlFor } from "@/sanity/image";

type PortableTextBlock = {
  children?: Array<{
    text?: string;
  }>;
};

export type WorkshopSeoDocument = {
  _id: string;
  _updatedAt?: string;
  number?: number;
  title?: string;
  titleEn?: string;
  slug?: {
    current?: string;
  };
  seo?: {
    title?: string;
    description?: string;
    image?: any;
    imageAlt?: string;
    noindex?: boolean;
  };
  poster?: any;
  posterAlt?: string;
  posterMeta?: {
    width?: number;
    height?: number;
  };
  tags?: string[];
  tutors?: Array<{
    name?: string;
    nameEn?: string;
    bio?: string;
    bioEn?: string;
  }>;
  tutor?: string;
  tutorEn?: string;
  tutorBio?: string;
  tutorBioEn?: string;
  description?: PortableTextBlock[];
  descriptionEn?: PortableTextBlock[];
  curriculum?: Array<{
    _key?: string;
    weekLabel?: string;
    weekLabelEn?: string;
    content?: string;
    contentEn?: string;
  }>;
  schedule?: Array<{
    _key?: string;
    date?: string;
    dateEn?: string;
    time?: string;
    timeEn?: string;
    capacity?: number;
    emailTemplate?: unknown;
  }>;
  capacity?: number;
  price?: number;
  studentPrice?: number;
  studentDiscountNotice?: string;
  isActive?: boolean;
  isClosed?: boolean;
  waitlistFormUrl?: string;
};

export function getWorkshopSeoTitle(workshop: WorkshopSeoDocument) {
  return normalizeWhitespace(
    workshop.seo?.title || workshop.title || workshop.titleEn || SITE_NAME,
  );
}

export function getWorkshopSeoDescription(workshop: WorkshopSeoDocument) {
  const explicitDescription = normalizeWhitespace(workshop.seo?.description);
  if (explicitDescription) return truncateDescription(explicitDescription);

  const body = normalizeWhitespace(portableTextToPlainText(workshop.description));
  if (body) return truncateDescription(body);

  const fallbackParts = [
    workshop.tutor ? `${workshop.tutor} 워크숍` : "",
    getPrimaryScheduleLabel(workshop),
    typeof workshop.price === "number" ? `${workshop.price.toLocaleString("ko-KR")}원` : "",
  ].filter(Boolean);

  if (fallbackParts.length > 0) {
    return truncateDescription(`${getWorkshopSeoTitle(workshop)} - ${fallbackParts.join(", ")}`);
  }

  return SITE_DESCRIPTION;
}

export function getWorkshopCanonicalUrl(workshop: WorkshopSeoDocument) {
  const path = getWorkshopPath(workshop);

  return path ? `${SITE_URL}${path}` : SITE_URL;
}

export function getWorkshopImageAlt(workshop: WorkshopSeoDocument) {
  return normalizeWhitespace(
    workshop.seo?.imageAlt ||
      workshop.posterAlt ||
      `${getWorkshopSeoTitle(workshop)} 포스터`,
  );
}

export function getWorkshopOgImageUrl(workshop: WorkshopSeoDocument) {
  const image = workshop.seo?.image || workshop.poster;

  if (!image) return `${SITE_URL}${SITE_OG_IMAGE}`;

  return urlFor(image).width(1200).height(630).fit("crop").auto("format").url();
}

export function getWorkshopPosterUrl(workshop: WorkshopSeoDocument) {
  if (!workshop.poster) return "";

  return urlFor(workshop.poster).width(1400).auto("format").url();
}

export function portableTextToPlainText(blocks?: PortableTextBlock[]) {
  if (!Array.isArray(blocks)) return "";

  return blocks
    .map((block) => block.children?.map((child) => child.text || "").join("") || "")
    .join(" ")
    .trim();
}

export function normalizeWhitespace(value?: string) {
  return (value || "").replace(/\s+/g, " ").trim();
}

export function truncateDescription(value: string, maxLength = 155) {
  const normalized = normalizeWhitespace(value);

  if (normalized.length <= maxLength) return normalized;

  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

export function getPrimaryScheduleLabel(workshop: WorkshopSeoDocument) {
  const session = workshop.schedule?.find((item) => item?.date || item?.time);

  return [session?.date, session?.time].filter(Boolean).join(" ");
}

export function getWorkshopStartDate(workshop: WorkshopSeoDocument) {
  const date = workshop.schedule?.find((item) => item?.date)?.date;

  return typeof date === "string" && /^\d{4}-\d{2}-\d{2}/.test(date) ? date : "";
}

export function buildWorkshopJsonLd(workshop: WorkshopSeoDocument) {
  const title = getWorkshopSeoTitle(workshop);
  const description = getWorkshopSeoDescription(workshop);
  const url = getWorkshopCanonicalUrl(workshop);
  const image = getWorkshopOgImageUrl(workshop);
  const startDate = getWorkshopStartDate(workshop);
  const offer =
    typeof workshop.price === "number"
      ? {
          "@type": "Offer",
          price: workshop.price,
          priceCurrency: "KRW",
          availability: workshop.isClosed
            ? "https://schema.org/SoldOut"
            : "https://schema.org/InStock",
          url,
        }
      : undefined;

  if (!startDate) {
    return stripUndefined({
      "@context": "https://schema.org",
      "@type": "Course",
      name: title,
      description,
      url,
      image: [image],
      provider: {
        "@type": "Organization",
        name: SITE_NAME,
        url: SITE_URL,
      },
      offers: offer,
    });
  }

  return stripUndefined({
    "@context": "https://schema.org",
    "@type": "Event",
    name: title,
    description,
    url,
    image: [image],
    startDate,
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    eventStatus: "https://schema.org/EventScheduled",
    location: {
      "@type": "Place",
      name: SITE_NAME,
      address: {
        "@type": "PostalAddress",
        addressLocality: "서울",
        addressCountry: "KR",
      },
    },
    organizer: {
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL,
    },
    performer: workshop.tutor
      ? {
          "@type": "Person",
          name: workshop.tutor,
        }
      : undefined,
    offers: offer,
  });
}

export function jsonLdString(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function stripUndefined(value: any): any {
  if (Array.isArray(value)) {
    return value.map(stripUndefined).filter((item) => item !== undefined);
  }

  if (value && typeof value === "object") {
    return Object.entries(value).reduce<Record<string, any>>((acc, [key, item]) => {
      if (item !== undefined) acc[key] = stripUndefined(item);
      return acc;
    }, {});
  }

  return value;
}
