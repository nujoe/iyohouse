import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import MixedWorkshopTitle from "@/components/workshop/MixedWorkshopTitle";
import {
  buildWorkshopJsonLd,
  getPrimaryScheduleLabel,
  getWorkshopImageAlt,
  getWorkshopOgImageUrl,
  getWorkshopPosterUrl,
  getWorkshopSeoDescription,
  getWorkshopSeoTitle,
  jsonLdString,
  portableTextToPlainText,
  type WorkshopSeoDocument,
} from "@/lib/workshopSeo";
import { getWorkshopPath, getWorkshopSlug } from "@/lib/workshopRoutes";
import { getPublishedWorkshopsForSeo, getWorkshopBySlug } from "@/sanity/workshops";

export const revalidate = 3600;

type WorkshopPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export async function generateStaticParams() {
  try {
    const workshops = await getPublishedWorkshopsForSeo();

    return workshops
      .map((workshop) => getWorkshopSlug(workshop))
      .filter(Boolean)
      .map((slug) => ({ slug }));
  } catch (error) {
    console.error("Workshop static params fetch failed:", error);
    return [];
  }
}

export async function generateMetadata({ params }: WorkshopPageProps): Promise<Metadata> {
  const { slug } = await params;
  const workshop = await getWorkshopBySlug(decodeURIComponent(slug));

  if (!workshop) {
    return {
      title: "워크숍",
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  const title = getWorkshopSeoTitle(workshop);
  const description = getWorkshopSeoDescription(workshop);
  const image = getWorkshopOgImageUrl(workshop);
  const canonicalPath = getWorkshopPath(workshop);
  const shouldIndex = !workshop.seo?.noindex;

  return {
    title,
    description,
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: {
      title,
      description,
      url: canonicalPath,
      type: "article",
      images: [
        {
          url: image,
          width: 1200,
          height: 630,
          alt: getWorkshopImageAlt(workshop),
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [
        {
          url: image,
          alt: getWorkshopImageAlt(workshop),
        },
      ],
    },
    robots: {
      index: shouldIndex,
      follow: shouldIndex,
    },
  };
}

export default async function WorkshopPage({ params }: WorkshopPageProps) {
  const { slug } = await params;
  const workshop = await getWorkshopBySlug(decodeURIComponent(slug));

  if (!workshop) notFound();

  const title = getWorkshopSeoTitle(workshop);
  const descriptionBlocks = getDescriptionBlocks(workshop);
  const posterUrl = getWorkshopPosterUrl(workshop);
  const posterWidth = workshop.posterMeta?.width || 1080;
  const posterHeight = workshop.posterMeta?.height || 1350;
  const scheduleLabel = getPrimaryScheduleLabel(workshop);
  const jsonLd = buildWorkshopJsonLd(workshop);

  return (
    <main className="workshop-seo-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }}
      />

      <nav className="workshop-seo-nav" aria-label="워크숍 탐색">
        <Link href="/">IYOHOUSE</Link>
        <span>/</span>
        <Link href="/?preset=workshop">WORKSHOP</Link>
      </nav>

      <article className="workshop-detail-container workshop-seo-detail">
        <div className="detail-layout">
          <div className="detail-left">
            <div className="detail-poster-wrapper">
              {posterUrl ? (
                <div
                  className="detail-poster-aspect-box"
                  style={{ "--aspect-ratio": `${posterWidth} / ${posterHeight}` } as CSSProperties}
                >
                  <Image
                    src={posterUrl}
                    className="detail-main-poster"
                    alt={getWorkshopImageAlt(workshop)}
                    width={posterWidth}
                    height={posterHeight}
                    sizes="(max-width: 1000px) 100vw, 45vw"
                    priority
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      objectPosition: "center top",
                    }}
                  />
                </div>
              ) : null}
            </div>
          </div>

          <div className="detail-right">
            <div className="detail-info-inner">
              <header className="detail-info-header">
                <div className="detail-tags">
                  <span className="pills pill-yellow">WORKSHOP</span>
                  {workshop.tags?.map((tag) => (
                    <span className="pills pill-black" key={tag}>
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="detail-title-wrapper">
                  <MixedWorkshopTitle as="h1" className="detail-main-title" title={title} />
                </div>
              </header>

              <section className="detail-description">
                {descriptionBlocks.map((text, index) => (
                  <p key={`${text}-${index}`}>{text}</p>
                ))}
              </section>

              {(workshop.tutor || workshop.tutorBio) && (
                <section className="detail-tutor-section">
                  {workshop.tutor && <div className="detail-tutor-name">Tutor. {workshop.tutor}</div>}
                  {workshop.tutorBio && <div className="detail-tutor-bio">{workshop.tutorBio}</div>}
                </section>
              )}

              {Array.isArray(workshop.curriculum) && workshop.curriculum.length > 0 && (
                <section className="detail-curriculum-section">
                  <h2 className="detail-section-label">CURRICULUM</h2>
                  {workshop.curriculum.map((week, index) => (
                    <div className="curriculum-row" key={week._key || `${week.weekLabel}-${index}`}>
                      {week.weekLabel && <span className="curriculum-week">{week.weekLabel}</span>}
                      {week.content && <span className="curriculum-content">{week.content}</span>}
                    </div>
                  ))}
                </section>
              )}

              <dl className="workshop-seo-meta-list">
                {scheduleLabel && (
                  <div>
                    <dt>일정</dt>
                    <dd>{scheduleLabel}</dd>
                  </div>
                )}
                {typeof workshop.capacity === "number" && (
                  <div>
                    <dt>정원</dt>
                    <dd>{workshop.capacity}명</dd>
                  </div>
                )}
                {typeof workshop.price === "number" && (
                  <div>
                    <dt>참가비</dt>
                    <dd>{workshop.price.toLocaleString("ko-KR")}원</dd>
                  </div>
                )}
              </dl>

              <div className="detail-footer-actions">
                <Link className="action-btn fill-btn" href={`/?workshop=${encodeURIComponent(workshop._id)}`}>
                  홈에서 신청하기
                </Link>
              </div>
            </div>
          </div>
        </div>
      </article>
    </main>
  );
}

function getDescriptionBlocks(workshop: WorkshopSeoDocument) {
  const blocks = Array.isArray(workshop.description) ? workshop.description : [];
  const texts = blocks.map((block) => portableTextToPlainText([block])).filter(Boolean);

  if (texts.length > 0) return texts;

  return [getWorkshopSeoDescription(workshop)];
}
