"use client";

import Image from "next/image";
import type { CSSProperties } from "react";

import { urlFor } from "@/sanity/image";

type WorkshopDetailPosterProps = {
    workshop: any;
};

export default function WorkshopDetailPoster({ workshop }: WorkshopDetailPosterProps) {
    const posterWidth = workshop.posterMeta?.width || 1080;
    const posterHeight = workshop.posterMeta?.height || 1350;

    const aspectRatio = `${posterWidth} / ${posterHeight}`;
    const imgUrl = workshop.poster ? urlFor(workshop.poster).width(1200).auto('format').url() : null;
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
                                objectFit: 'cover',
                                objectPosition: 'center top',
                            }}
                        />
                    </div>
                ) : null}
            </div>
        </div>
    );
}
