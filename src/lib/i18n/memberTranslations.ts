import type { Language } from "./translations";

export type MemberProfile = {
  id: number;
  name: string;
  role: string;
  description: string;
  image?: string;
  links?: { label: string; url: string }[];
};

const ko: MemberProfile[] = [
  {
    id: 1,
    name: "현 ",
    role: "Director",
    description:
      "현은 다양한 창작의 방법론을 연구하는 서울 기반의 디렉터로 ‘실패를 통해 자기 이해를 한다’는 문장을 좋아하며, 무엇이든 도전하고 실패하기를 즐긴다. 현재는 히얼투필름(@heretofilm)과 키요이(@kiyoioffice), 그리고 이요하우스(@iyohouse )를 운영하는 중. 비주얼 기획, 연출 감독, 촬영/조명 감독, 포토그래퍼, 퍼실리테이터, 놀이 연구원으로 활동하며 Ai와 동시대 디자인 파이프라인 연구하고 지식의 공유로 지속가능한 창작 생태계를 만들고자 한다.",
    links: [
      { label: "INSTAGRAM", url: "https://www.instagram.com/hyun2xyz/" },
      { label: "WEBSITE", url: "#" },
    ],
  },
  {
    id: 2,
    name: "연서",
    role: "Designer",
    description:
      "가느다란 실이 손가락 사이를 자유롭게 오가듯, ‘이요’는 우연한 교차에 주목합니다. 팽팽히 당기고 느슨히 푸는 실뜨기처럼, 생각은 서로의 손길을 타며 끊임없이 변형됩니다. 요람 속의 실들은 무엇이 될지 모른 채 잠시 엉키고 때로는 끊어지기도 합니다. 하지만 우리는 어긋남조차 새로운 연결이 된다는 사실을 기꺼이 받아들입니다. 창작자를 위한 공공공원은 이요하우스로 이어집니다.",
    links: [
      { label: "링크 1", url: "#" },
      { label: "링크 2", url: "#" },
    ],
  },
  {
    id: 3,
    name: "가은",
    role: "Developer",
    description:
      "커뮤니케이션 디자인을 전공하고 시각적 실험을 기반으로 예술과 기술을 탐구하고 있다. 아트 콜렉티브 달리와보기@daliwabogi 미디어아트 팀에서 창작자로 활동하고 있다. 그리고 이요하우스에서 아날로그 방식과 함께 그래픽 작업을 시도하고 있다. 요즘은 일상에서 재료, 사물, 제스처를 통해 아이디어를 탐구하고 구현하는 창의적 방법론을 찾아가는 중이다.",
    links: [{ label: "INSTAGRAM", url: "https://www.instagram.com/yeohwal/" }],
  },
  {
    id: 4,
    name: "가현",
    role: "Artist",
    description:
      "무한도전에 정 과장이 있다면 이요하우스에는 문 과장이 있다. 디자이너들 사이에서 꾸준히 파워포인트로 작업하는 비전공자. 잘 만든 B급 영화처럼 대놓고 어설픈데 웃다 보면 묘하게 여운을 주는 지점을 공략한다. <2 Broke Girls>, <Miranda> 등 영미권 시트콤의 농담을 좋아한다. 좋아하는 캐릭터는 <Modern Family>의 Gloria. 무해해 인스타그램 계정(@muhaehaehaehaehaehaehaehae)을 운영하고 있고, 슐튀르미디어(@sulturemedia)에서 글을 쓰고 있다.",
    links: [{ label: "INSTAGRAM", url: "https://www.instagram.com/sulturemedia/" }],
  },
  {
    id: 5,
    name: "준",
    role: "Collaborator",
    description:
      "준은 코딩과 웹을 중심으로 예술과 기술 사이의 실험을 이어가는 디자이너로 웹사이트 제작과 인터랙션 구현, 생성형 AI를 활용한 제작 방식을 탐구하며, 간단한 코드부터 시작해 구조, 스타일, 인터랙션을 직접 설계한다. AI 기반 에디터와 생성형 AI를 활용한 동시대 웹 제작 방식에 관심을 두고 있다.",
    links: [{ label: "INSTAGRAM", url: "https://www.instagram.com/djwns1234/" }],
  },
];

const en: MemberProfile[] = [
  {
    id: 1,
    name: "Hyun",
    role: "Director",
    description:
      "Hyun is a Seoul-based director who studies different methods of making. They like the phrase, “we understand ourselves through failure,” and enjoy trying, failing, and trying again. Hyun currently runs Here to Film (@heretofilm), Kiyoi (@kiyoioffice), and IYOHOUSE (@iyohouse). Working across visual planning, directing, cinematography, lighting, photography, facilitation, and play research, Hyun explores AI and contemporary design pipelines while building a sustainable creative ecosystem through shared knowledge.",
    links: [
      { label: "INSTAGRAM", url: "https://www.instagram.com/hyun2xyz/" },
      { label: "WEBSITE", url: "#" },
    ],
  },
  {
    id: 2,
    name: "Yeonseo",
    role: "Designer",
    description:
      "Just as a thin thread moves freely between fingers, 'iyo' focuses on accidental crossings. Like cat's cradle, pulling tight and releasing loose, thoughts constantly transform through each other's touch. The threads in the cradle tangle for a moment and sometimes break, not knowing what they will become. But we willingly accept that even misalignment becomes a new connection. Public Park for Creators leads to IYOHOUSE.",
    links: [
      { label: "LINK 1", url: "#" },
      { label: "LINK 2", url: "#" },
    ],
  },
  {
    id: 3,
    name: "Gaeun",
    role: "Developer",
    description:
      "Gaeun studied communication design and explores art and technology through visual experimentation. She works as a creator on the media art team of the art collective Daliwabogi (@daliwabogi), and at IYOHOUSE she experiments with graphic work alongside analog methods. These days, she is searching for creative methodologies that discover and materialize ideas through everyday materials, objects, and gestures.",
    links: [{ label: "INSTAGRAM", url: "https://www.instagram.com/yeohwal/" }],
  },
  {
    id: 4,
    name: "Gahyun",
    role: "Artist",
    description:
      "If Infinite Challenge had Manager Jung, IYOHOUSE has Manager Moon. A non-design-major who persistently works with PowerPoint among designers, Gahyun aims for the kind of openly awkward charm found in a well-made B movie, where laughter leaves a strange aftertaste. She enjoys jokes from English-language sitcoms such as 2 Broke Girls and Miranda, and her favorite character is Gloria from Modern Family. She runs the Instagram account @muhaehaehaehaehaehaehaehae and writes at Sulture Media (@sulturemedia).",
    links: [{ label: "INSTAGRAM", url: "https://www.instagram.com/sulturemedia/" }],
  },
  {
    id: 5,
    name: "Jun",
    role: "Collaborator",
    description:
      "Jun is a designer who experiments between art and technology through code and the web. He builds websites and interactions, explores generative AI-based making, and designs structures, styles, and interactions by starting from simple code. His current interests include AI-assisted editors and contemporary web production methods using generative AI.",
    links: [{ label: "INSTAGRAM", url: "https://www.instagram.com/djwns1234/" }],
  },
];

export const MEMBER_TEXT = {
  ko,
  en,
} satisfies Record<Language, MemberProfile[]>;
