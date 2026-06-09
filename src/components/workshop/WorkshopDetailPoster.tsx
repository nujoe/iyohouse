"use client";

import Image from "next/image";
import type { CSSProperties } from "react";

import { getLegacyPosterMeta } from "@/lib/legacyPosters";
import { urlFor } from "@/sanity/image";

type WorkshopDetailPosterProps = {
    workshop: any;
};

export default function WorkshopDetailPoster({ workshop }: WorkshopDetailPosterProps) {
    const isSanity = !!workshop._id;
    const legacyPoster = !isSanity ? getLegacyPosterMeta(Number(workshop.id)) : null;
    let posterWidth = legacyPoster?.width || 1080;
    let posterHeight = legacyPoster?.height || 1350;

    if (isSanity && workshop.posterMeta) {
        posterWidth = workshop.posterMeta.width;
        posterHeight = workshop.posterMeta.height;
    }

    const aspectRatio = `${posterWidth} / ${posterHeight}`;
    const imgUrl = isSanity
        ? (workshop.poster ? urlFor(workshop.poster).width(1200).auto('format').url() : null)
        : legacyPoster?.src;
    const imageAlt = workshop.posterAlt || workshop.title || "IYOHOUSE workshop poster";

    return (
        <div className="detail-left">
            <div className="detail-poster-wrapper">
                {imgUrl ? (
                    <div className="detail-poster-aspect-box" style={{ "--aspect-ratio": aspectRatio } as CSSProperties}>
                        <Image
                            src={imgUrl}
                            className="detail-main-poster"
                            alt={imageAlt}
                            width={posterWidth}
                            height={posterHeight}
                            sizes="(max-width: 1000px) 100vw, 45vw"
                            loading="lazy"
                            style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'contain',
                                objectPosition: 'center',
                            }}
                        />
                    </div>
                ) : null}
            </div>
        </div>
    );
}
