"use client";

import React from "react";

interface Member {
  id: number;
  name: string;
  role: string;
  description: string;
  image?: string;
  links?: { label: string; url: string }[];
}

const members: Member[] = [
  {
    id: 1,
    name: "Lorem Ipsum",
    role: "Director / Designer",
    description: "Lorem im nonummy nibh euismod tincidunt ut laoreet dolore magna aliquam erat.",
    links: [{ label: "Instagram", url: "#" }, { label: "Website", url: "#" }]
  },
  {
    id: 2,
    name: "Sit Amet",
    role: "Developer",
    description: "Lorem ipsum dolor sit amet, consectetuer adipiscing elit, sed diam nonummy nibh euismod tincidunt ut laoreet dolore magna aliquam erat.",
    links: [{ label: "Github", url: "#" }]
  },
  {
    id: 3,
    name: "Dolore Magna",
    role: "VFX Artist",
    description: "Lorem , sed diam nonummy nibh euismod tincidunt ut laoreet dolore magna aliquam erat.",
    links: [{ label: "Behance", url: "#" }]
  }
];

export default function MemberView() {
  return (
    <div className="member-view-container">
      <div className="member-layout-v2">



        {/* Separated Content Sections */}
        <div className="member-main-content">

          {/* 1. Member Text Grid (Masonry) */}
          <div className="member-text-masonry">
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
                      <a key={i} href={link.url} className="link-row-v2">
                        <div className="link-sq"></div>
                        <div className="link-label-box">{link.label}</div>
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            ))}
            {[4, 5, 6].map((idx) => (
              <div key={idx} className="member-card">
                <div className="card-header">
                  <h2 className="card-name">Lorem</h2>
                </div>
                <div className="card-body">
                  <p className="card-desc">
                    Lorem ipsum dolor sit amet, Lorem ipsum, dolor sit amet consectetur adipisicing elit. Quis quod optio tempora maiores molestias delectus eaque omnis modi numquam sit ullam unde, inventore in, praesentium corrupti ratione totam asperiores minus.consectetuer adipiscing elit, sed diam nonummy nibh euismod tincidunt ut laoreet dolore magna aliquam erat.
                  </p>
                  <div className="card-links">
                    <div className="link-row-v2">
                      <div className="link-sq"></div>
                      <div className="link-label-box">링크 1</div>
                    </div>
                    <div className="link-row-v2">
                      <div className="link-sq"></div>
                      <div className="link-label-box">링크 2</div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* 2. Visual Aside (Photos) - Separated from the grid */}
          <div className="member-visual-aside">
            <div className="visual-stack-v2">
              <div className="v-box-v2 large"></div>
              <div className="v-box-v2 medium"></div>
              <div className="v-box-v2 small"></div>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
