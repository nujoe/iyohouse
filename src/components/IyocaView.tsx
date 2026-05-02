import React, { useState } from "react";

const iyocaPosters = [
    {
        id: 1,
        src: "/assets/01.png",
        rotation: -2,
        title: "CREATIVE CODING #01",
        description: "비주얼 코딩의 기초를 다루는 첫 번째 아카이브입니다. 자바스크립트를 활용한 동적 격자 시스템을 탐구합니다."
    },
    {
        id: 2,
        src: "/assets/02.png",
        rotation: 3,
        title: "GRID SYSTEM STUDY",
        description: "타이포그래피와 격자의 관계를 분석한 프로젝트입니다. 정교한 설계도 레이아웃을 실험했습니다."
    },
    {
        id: 3,
        src: "/assets/03.png",
        rotation: -1,
        title: "DIGITAL BLUEPRINT",
        description: "디지털 공간에서의 건축적 문법을 시각화했습니다. 선과 면의 교차를 통한 공간 구성을 보여줍니다."
    },
    {
        id: 4,
        src: "/assets/04.png",
        rotation: 2,
        title: "MOTION GRAPHICS V1",
        description: "움직이는 인터페이스의 리듬감을 연구했습니다. 유저의 상호작용에 반응하는 애니메이션 시스템입니다."
    },
    {
        id: 5,
        src: "/assets/05.png",
        rotation: -3,
        title: "생성형 AI 이미지 동아리 '무해해'",
        description: "무해해 동아리는 생성형 AI로 웃기고 무해(無害)한 사진을 만드는 모임입니다. 완성된 이미지는 오픈 소스로 공유하며, 결과물이 실제로 재활용되는 순간을 발견하는 것이 목표입니다.",
        fullDetails: {
            summary: "웃기고 무해한 사진을 만드는 AI 창작 모임",
            info: [
                { label: "진행", value: "총 4회 / 정원 20명" },
                { label: "대상", value: "웃긴 거 만들고 싶은 사람, AI 입문자" },
                { label: "회비", value: "30,000원" },
                { label: "준비물", value: "노트북, 열쩡" }
            ],
            schedule: [
                { week: "1주차", date: "2/1(일) 대면", time: "14:00-19:00", content: "오리엔테이션 + 이미지 생성 워크숍" },
                { week: "2주차", date: "2/8(일) 비대면", time: "19:00-21:00", content: "결과물 공유 + 피어 러닝" },
                { week: "3주차", date: "2/15(일) 비대면", time: "19:00-21:00", content: "결과물 공유 + 피어 러닝" },
                { week: "4주차", date: "2/21(토) 대면", time: "16:00-18:00", content: "성과 발표 + 결과물 아카이빙" }
            ],
            location: "마포구 희우정로 5길 29, 3층 이요하우스",
            tutor: {
                name: "현 (@hyun2xyz)",
                bio: "다양한 창작 방법론을 연구하는 디렉터. 히얼투필름, 키요이, 이요하우스 운영자. AI와 디자인 파이프라인을 연구하며 지식 공유를 통한 지속 가능한 생태계를 지향합니다."
            },
            credits: "ᴘᴏꜱᴛᴇʀ ᴅᴇꜱɪɢɴ 가현(@glwormun)"
        }
    },
];

export default function IyocaView({ active }: { active: boolean }) {
    const [hoveredPoster, setHoveredPoster] = useState<typeof iyocaPosters[0] | null>(null);
    const [selectedPoster, setSelectedPoster] = useState<typeof iyocaPosters[0] | null>(iyocaPosters[0]);

    const displayPoster = hoveredPoster || selectedPoster;

    return (
        <div className="iyoca-view-container">
            <div className="iyoca-split-layout">
                <div className="iyoca-left-pane">
                    <div className="iyoca-grid">
                        {iyocaPosters.map((img) => (
                            <div
                                key={img.id}
                                className={`iyoca-poster-card ${selectedPoster?.id === img.id ? 'selected' : ''}`}
                                style={{ transform: `rotate(${img.rotation}deg)` } as React.CSSProperties}
                                onMouseEnter={() => setHoveredPoster(img)}
                                onMouseLeave={() => setHoveredPoster(null)}
                                onClick={() => setSelectedPoster(img)}
                            >
                                <div className="card-tape"></div>
                                <div className="poster-inner">
                                    <img src={img.src} alt={`Iyoca Archive ${img.id}`} />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="iyoca-right-pane">
                    {displayPoster && (
                        <div className="iyoca-detail-display">
                            <div className="detail-scroll-area">
                                <div className="detail-header">
                                    <span className="detail-id"># {displayPoster.id.toString().padStart(2, '0')} ARCHIVE</span>
                                    <h1 className="detail-title">{displayPoster.title}</h1>
                                </div>

                                <div className="detail-visual">
                                    <img src={displayPoster.src} alt="Detail View" />
                                </div>

                                <div className="detail-body">
                                    <p className="detail-description">{displayPoster.description}</p>

                                    {displayPoster.fullDetails ? (
                                        <div className="full-details-box">
                                            <div className="info-grid">
                                                {displayPoster.fullDetails.info.map((item, idx) => (
                                                    <div key={idx} className="info-item">
                                                        <span className="label">✻ {item.label}</span>
                                                        <span className="value">{item.value}</span>
                                                    </div>
                                                ))}
                                            </div>

                                            <div className="detail-section">
                                                <h3 className="section-title">𓇬 진행 안내 𓇬</h3>
                                                <div className="schedule-list">
                                                    {displayPoster.fullDetails.schedule.map((s, idx) => (
                                                        <div key={idx} className="schedule-row">
                                                            <div className="s-week">{s.week}</div>
                                                            <div className="s-info">
                                                                <span className="s-date">{s.date}</span>
                                                                <span className="s-time">{s.time}</span>
                                                                <p className="s-content">{s.content}</p>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            <div className="detail-section">
                                                <h3 className="section-title">𓇬 튜터 소개 𓇬</h3>
                                                <div className="tutor-info">
                                                    <p className="tutor-name">{displayPoster.fullDetails.tutor.name}</p>
                                                    <p className="tutor-bio">{displayPoster.fullDetails.tutor.bio}</p>
                                                </div>
                                            </div>

                                            <div className="detail-footer-meta">
                                                <p className="location">✻ 장소: {displayPoster.fullDetails.location}</p>
                                                <p className="credits">{displayPoster.fullDetails.credits}</p>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="detail-extra-info">
                                            <h3>ARCHIVE METADATA</h3>
                                            <p>Project Category: Visual Design</p>
                                            <p>Curator: IYOHOUSE Lab</p>
                                            <div className="technical-grid">
                                                <span>SCALE: 1:1</span>
                                                <span>TYPE: ARCHIVE_V1</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="iyoca-footer">
                <button className="open-call-btn">
                    <span>OPEN CALL +</span>
                </button>
            </div>
        </div>
    );
}
