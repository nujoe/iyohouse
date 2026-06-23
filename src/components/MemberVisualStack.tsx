"use client";


export default function MemberVisualStack() {
  const images = [
    { src: "/member/2.JPG", width: 736, height: 736 },
    { src: "/member/3.JPG", width: 736, height: 736 },
    { src: "/member/4.JPG", width: 736, height: 736 },
  ];

  return (
    <div className="visual-stack-v2">
      {images.map((img, idx) => (
        <div key={idx} className="v-box-v2">
          <img
            src={imgUrl(img.src)}
            alt={`Member Visual ${idx + 1}`}
            width={img.width}
            height={img.height}
            loading={idx === 0 ? "eager" : "lazy"}
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
