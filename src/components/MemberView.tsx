"use client";

import { memo } from "react";
import { MEMBER_TEXT } from "@/lib/i18n/memberTranslations";
import { useLanguage } from "@/lib/i18n";
import MemberVisualStack from "./MemberVisualStack";

// 캘린더에서 사용하는 멤버별 고유 색상 Hex 코드 매핑
const getMemberColorHex = (name: string): string => {
  const cleanName = name.trim().toLowerCase();
  switch (cleanName) {
    case "준":
    case "jun":
      return "#FF3B30"; // var(--tag-red)
    case "현":
    case "hyun":
      return "#c6ff00"; // var(--tag-green)
    case "가은":
    case "gaeun":
      return "#3b82f6"; // var(--tag-blue)
    case "가현":
    case "gahyun":
      return "#8b5cf6"; // var(--tag-purple)
    case "연서":
    case "yeonseo":
      return "#f8f01d"; // var(--tag-yellow)
    default:
      return "#f8f01d"; // default yellow
  }
};

function MemberView() {
  const { language } = useLanguage();
  const members = MEMBER_TEXT[language];

  return (
    <div className="member-view-container">
      <div className="member-layout-v2">
        <div className="member-main-content">
          <div className="member-text-masonry">
            <div className="masonry-inner">
              {members.map((member) => (
                <div key={member.id} className="member-card">
                  <div className="card-header">
                    <h2 
                      className="card-name"
                      style={{
                        backgroundImage: `url("data:image/svg+xml,%3Csvg width='13' height='10' viewBox='0 0 13 10' xmlns='http://www.w3.org/2000/svg'%3E%3Crect x='0.5' y='0.5' width='9' height='9' fill='${encodeURIComponent(getMemberColorHex(member.name))}' stroke='black' stroke-width='1'/%3E%3C/svg%3E")`
                      }}
                    >
                      {member.name}
                    </h2>
                  </div>
                  <div className="card-body">
                    <p className="card-desc">
                      {member.description}
                    </p>
                    <div className="card-links">
                      {member.links?.map((link, i) => (
                        <a key={i} href={link.url} className="link-row-v2" target="_blank" rel="noopener noreferrer">
                          {link.label}
                        </a>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mobile-main-divider"></div>

          <div className="member-visual-aside">
            <MemberVisualStack />
          </div>
        </div>
      </div>
    </div>
  );
}

export default memo(MemberView);
