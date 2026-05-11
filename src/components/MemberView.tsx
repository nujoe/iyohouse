"use client";

import { memo } from "react";
import MemberVisualStack from "./MemberVisualStack";

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
    role: "Director",
    description: "Lorem im nonummy nibh euismod tincidunt ut laoreet dolore magna aliquam erat.",
    links: [{ label: "INSTAGRAM", url: "#" }, { label: "WEBSITE", url: "#" }]
  },
  {
    id: 2,
    name: "Lorem",
    role: "Designer",
    description: "Lorem ipsum dolor sit amet, Lorem ipsum, dolor sit amet, consectetur adipiscing elit. Quis quod optio tempora maiores molestias delectus eaque omnis modi numquam sit ullam unde, inventore in, praesentium corrupti ratione totam asperiores minus.consectetur adipiscing elit, sed diam nonummy nibh euismod tincidunt ut laoreet dolore magna aliquam erat.",
    links: [{ label: "링크 1", url: "#" }, { label: "링크 2", url: "#" }]
  },
  {
    id: 3,
    name: "Sit Amet",
    role: "Developer",
    description: "Lorem ipsum dolor sit amet, consectetuer adipiscing elit, sed diam nonummy nibh euismod tincidunt ut laoreet dolore magna aliquam erat.",
    links: [{ label: "GITHUB", url: "#" }]
  },
  {
    id: 4,
    name: "Dolore Magna",
    role: "Artist",
    description: "Lorem , sed diam nonummy nibh euismod tincidunt ut laoreet dolore magna aliquam erat. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
    links: [{ label: "BEHANCE", url: "#" }]
  },
  {
    id: 5,
    name: "Lorem",
    role: "Collaborator",
    description: "Lorem ipsum dolor sit amet, Lorem ipsum, dolor sit amet, consectetur adipiscing elit. Quis quod optio tempora maiores molestias delectus eaque omnis modi numquam sit ullam unde, inventore in, praesentium corrupti ratione totam asperiores minus.consectetur adipiscing elit.",
    links: [{ label: "링크 1", url: "#" }]
  }
];

function MemberView() {
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
                        <a key={i} href={link.url} className="link-row-v2">
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
