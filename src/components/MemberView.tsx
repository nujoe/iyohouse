"use client";

import { memo } from "react";
import { MEMBER_TEXT } from "@/lib/i18n/memberTranslations";
import { useLanguage } from "@/lib/i18n";
import MemberVisualStack from "./MemberVisualStack";

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
                    <h2 className="card-name">{member.name}</h2>
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

          <div className="member-visual-aside">
            <MemberVisualStack />
          </div>
        </div>
      </div>
    </div>
  );
}

export default memo(MemberView);
