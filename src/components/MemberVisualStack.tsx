"use client";

import Image from "next/image";

export default function MemberVisualStack() {
  const images = [
    { src: "/member/_ (16).jpeg", width: 736, height: 736 },
    { src: "/member/_ (19).jpeg", width: 736, height: 414 },
    { src: "/member/_ (23).jpeg", width: 736, height: 736 },
    { src: "/member/_ (25).jpeg", width: 736, height: 414 },
  ];

  return (
    <div className="visual-stack-v2">
      {images.map((img, idx) => (
        <div key={idx} className="v-box-v2">
          <Image
            src={imgUrl(img.src)}
            alt={`Member Visual ${idx + 1}`}
            width={img.width}
            height={img.height}
            sizes="(max-width: 768px) 100vw, 33vw"
            style={{
              width: '100%',
              height: 'auto',
              display: 'block'
            }}
          />
        </div>
      ))}
    </div>
  );
}

// Helper to handle space in filenames if necessary, though Next.js usually handles them.
// But better safe than sorry for URL encoding.
function imgUrl(path: string) {
  return path.replace(/ /g, '%20');
}
