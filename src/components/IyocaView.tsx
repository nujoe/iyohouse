"use client";

import React, { useRef } from "react";

const collageImages = [
    { id: 1, src: "/assets/01.png", rotation: -4, scale: 1.0, top: "15%", left: "2%" },
    { id: 2, src: "/assets/02.png", rotation: 6, scale: 0.9, top: "10%", left: "15%" },
    { id: 3, src: "/assets/03.png", rotation: -2, scale: 1.1, top: "25%", left: "28%" },
    { id: 4, src: "/assets/04.png", rotation: 8, scale: 1.0, top: "5%", left: "42%" },
    { id: 5, src: "/assets/05.png", rotation: -6, scale: 0.95, top: "20%", left: "55%" },
    { id: 6, src: "/assets/01.png", rotation: 3, scale: 1.05, top: "12%", left: "70%" },
    { id: 7, src: "/assets/02.png", rotation: -5, scale: 0.9, top: "28%", left: "82%" },
    { id: 8, src: "/assets/03.png", rotation: 7, scale: 1.1, top: "8%", left: "95%" },
    { id: 9, src: "/assets/04.png", rotation: -3, scale: 1.0, top: "18%", left: "110%" },
    { id: 10, src: "/assets/05.png", rotation: 5, scale: 0.95, top: "22%", left: "125%" },
    { id: 11, src: "/assets/01.png", rotation: -8, scale: 1.05, top: "10%", left: "140%" },
    { id: 12, src: "/assets/02.png", rotation: 4, scale: 1.1, top: "25%", left: "155%" },
    { id: 13, src: "/assets/03.png", rotation: -2, scale: 0.9, top: "5%", left: "170%" },
];

export default function IyocaView({ active }: { active: boolean }) {
    const containerRef = useRef<HTMLDivElement>(null);

    return (
        <div 
            ref={containerRef} 
            className="iyoca-collage-container"
        >
            <div className="collage-track">
                {collageImages.map((img) => (
                    <div 
                        key={img.id}
                        className="collage-item"
                        style={{
                            top: img.top,
                            left: img.left,
                            transform: `rotate(${img.rotation}deg) scale(${img.scale})`,
                        } as React.CSSProperties}
                    >
                        <div className="collage-card">
                            <div className="card-tape"></div>
                            <img src={img.src} alt={`Iyoca Archive ${img.id}`} />
                        </div>
                    </div>
                ))}
                
                {/* 하단 Open Call 버튼 */}
                <div className="collage-footer">
                    <button className="open-call-btn">
                        <span>OPEN CALL +</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
