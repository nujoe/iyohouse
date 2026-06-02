export const LANGUAGES = ["ko", "en"] as const;

export type Language = (typeof LANGUAGES)[number];

export const LANGUAGE_STORAGE_KEY = "iyohouse-language";

type RefundListItem = {
    label?: string;
    text: string;
};

type RefundSection = {
    title: string;
    body?: string;
    contactEmailLabel?: string;
    items?: RefundListItem[];
};

const ko = {
    nav: {
        main: "MAIN",
        member: "MEMBER",
        workshop: "WORKSHOP",
        calendar: "CALENDAR",
        contact: "CONTACT",
    },
    mainIntroTitle: "이요하우스는...",
    mainIntro: "가느다란 실이 손가락 사이를 자유롭게 오가듯, ‘이요’는 우연한 교차에 주목합니다. 팽팽히 당기고 느슨히 푸는 실뜨기처럼, 생각은 서로의 손길을 타며 끊임없이 변형됩니다. 요람 속의 실들은 무엇이 될지 모른 채 잠시 엉키고 때로는 끊어지기도 합니다. 하지만 우리는 어긋남조차 새로운 연결이 된다는 사실을 기꺼이 받아들입니다. 창작자를 위한 공공공원은 이요하우스로 이어집니다.",
    auth: {
        login: "로그인",
        signup: "회원가입",
        logout: "로그아웃",
        editProfile: "회원정보 수정",
        completePrompt: "인증이 완료되었습니다. 서비스를 이용하려면 회원가입을 완료해 주세요.",
        completeAction: "회원가입 완료하기",
        welcome: (name?: string | null) => `${name || ""}님, 안녕하세요!`,
        bioLabel: "자기소개",
        noBio: "입력된 자기소개가 없습니다.",
        kakao: "카카오로 시작하기",
        google: "구글로 시작하기",
        emailPlaceholder: "이메일 주소",
        passwordPlaceholder: "비밀번호",
        submitting: "처리 중...",
        emailSignup: "이메일로 가입하기",
        emailLogin: "이메일로 로그인",
        hasAccount: "이미 계정이 있으신가요?",
        noAccount: "아직 계정이 없으신가요?",
        switchToLogin: "로그인하기",
        switchToSignup: "회원가입하기",
        emailRequired: "이메일과 비밀번호를 입력해 주세요.",
        passwordMin: "비밀번호는 최소 6자리 이상이어야 합니다.",
        signupDone: "회원가입이 완료되었습니다! 가입하신 정보로 로그인되었습니다.",
        genericError: "오류가 발생했습니다.",
    },
    contact: {
        title: "이요하우스는 새로운 연결을 기다립니다",
        email: "이메일",
        subject: "제목",
        message: "내용을 입력해주세요",
        required: "이메일과 내용을 입력해 주세요.",
        success: "문의가 성공적으로 전송되었습니다! 곧 연락드릴게요.",
        error: "전송 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
        sending: "전송 중...",
        send: "전송!",
    },
    workshop: {
        scheduleSelect: "일정 선택",
        closed: "마감",
        apply: "워크숍 신청",
        legacyTitle: (id: number | string) => `AI.zip ${id} 그래픽`,
        fallbackTitle: (id?: number | string | null) => `워크숍${id ? ` ${id}` : ""}`,
        tutorLabel: (name: string) => `튜터 : ${name}`,
        curriculum: "커리큘럼",
        capacityLabel: (count: number) => `정원 ${count}명`,
        priceLabel: (amount?: number | null) => typeof amount === "number" ? `${amount.toLocaleString()}원` : "",
        missingDbId: "이 워크숍은 아직 신청할 수 없습니다. (DB UUID 누락)",
        closedAlert: "이미 마감된 워크샵입니다.",
        scheduleRequired: "일정을 먼저 선택해 주세요.",
        paymentMisconfigured: "결제 시스템이 올바르게 설정되지 않았습니다. 관리자에게 문의해 주세요.",
        paymentPreparing: "결제 시스템을 준비 중입니다. 잠시 후 다시 시도해 주세요.",
        requestError: "요청 중 오류가 발생했습니다",
        refundPolicy: {
            title: "취소 및 환불 정책",
            intro: [
                "본 정책은 이요하우스에서 진행하는 유료 워크숍, 클래스, 모임형 프로그램에 적용됩니다.",
                "관련 법령 또는 소비자분쟁해결기준이 본 정책보다 참가자에게 유리한 경우, 해당 기준을 우선 적용합니다.",
                "환불 신청 시점은 이요하우스가 이메일, 신청폼, 채널톡 등 공식 접수 경로를 통해 취소 의사를 확인한 시각을 기준으로 합니다.",
            ],
            sections: [
                {
                    title: "참가자 사정으로 취소하는 경우",
                    items: [
                        { label: "워크숍 시작 전:", text: "참가비 전액 환불" },
                        { label: "워크숍 시작 후 총 진행 시간의 1/3 경과 전:", text: "참가비의 2/3 환불" },
                        { label: "워크숍 시작 후 총 진행 시간의 1/2 경과 전:", text: "참가비의 1/2 환불" },
                        { label: "총 진행 시간의 1/2 경과 후 또는 무단 불참:", text: "환불 불가" },
                        { text: "다회차 워크숍의 경우, 취소가 접수된 회차가 속한 기간의 환불 가능 금액과 아직 시작하지 않은 잔여 회차 금액을 합산해 환불합니다." },
                    ] as RefundListItem[],
                },
                {
                    title: "재료비·키트·교재가 있는 경우",
                    items: [
                        { text: "워크숍 시작 전 취소 시, 미사용·미수령 상태의 재료비는 환불합니다." },
                        { text: "이미 발송된 키트나 교재는 미개봉 상태로 반환 확인 후 환불할 수 있으며, 반송비는 참가자 부담입니다." },
                        { text: "개별 제작, 식재료, 생화, 맞춤 인쇄물 등 재판매가 어려운 재료는 신청 페이지에 사전 고지한 경우 실비를 제외하고 환불할 수 있습니다." },
                    ] as RefundListItem[],
                },
                {
                    title: "이요하우스 사정으로 취소 또는 변경되는 경우",
                    items: [
                        { text: "모집 인원 미달, 진행자 사정, 장소 문제 등 이요하우스 사정으로 워크숍이 취소되면 참가비 전액을 환불합니다." },
                        { text: "일정이 변경되는 경우, 참가자는 변경 일정 참여 또는 전액 환불 중 선택할 수 있습니다." },
                        { text: "단, 참가자의 교통비·숙박비 등 외부 비용은 이요하우스가 별도로 보장하기로 고지한 경우를 제외하고 보상하지 않습니다." },
                    ] as RefundListItem[],
                },
                {
                    title: "양도 및 일정 변경",
                    items: [
                        { text: "워크숍 시작 전까지 이요하우스에 사전 연락하면 참가권을 다른 사람에게 양도할 수 있습니다." },
                        { text: "동일 워크숍의 다른 일정으로 변경이 가능한 경우 1회에 한해 변경을 도와드립니다. 단, 잔여석이 없거나 재료 준비가 완료된 경우 변경이 어려울 수 있습니다." },
                    ] as RefundListItem[],
                },
                {
                    title: "환불 처리 방법",
                    items: [
                        { text: "카드 결제는 원 결제수단 취소를 원칙으로 합니다." },
                        { text: "계좌이체 결제는 환불받을 계좌 정보를 확인한 뒤 처리합니다." },
                        { text: "환불은 접수일로부터 영업일 3~7일 이내 처리하며, 카드사·PG사 사정에 따라 실제 입금 또는 승인 취소 반영일은 달라질 수 있습니다." },
                    ] as RefundListItem[],
                },
                {
                    title: "문의 및 접수",
                    body: "환불 또는 변경 신청은 아래 공식 경로로 접수해 주세요.",
                    contactEmailLabel: "이메일",
                },
            ] as RefundSection[],
        },
    },
    footer: {
        company: "주식회사 이요하우스",
        address: "ADDRESS : 서울시 마포구 희우정로 5길 29, 3층",
        businessLicense: "BUSINESS LICENSE : 718-88-02112",
        mallOrderLicense: "MALL-ORDER LICENSE : 2024-서울송파-2708",
        email: "EMAIL : goyangiyoram@gmail.com",
        websiteDesign: "웹사이트 디자인 : 어 준",
    },
};

export type Translation = typeof ko;

const en: Translation = {
    nav: {
        main: "MAIN",
        member: "MEMBER",
        workshop: "WORKSHOP",
        calendar: "CALENDAR",
        contact: "CONTACT",
    },
    mainIntroTitle: "IYOHOUSE is",
    mainIntro: "Like a fine thread moving freely between fingers, IYO pays attention to accidental crossings. As in string figure play, where tension and release keep changing the shape, ideas transform through one another's hands. The threads in the cradle may tangle, loosen, or break before they know what they will become. We welcome even misalignment as the beginning of a new connection. A public park for creators continues as IYOHOUSE.",
    auth: {
        login: "Login",
        signup: "Sign up",
        logout: "Log out",
        editProfile: "Edit profile",
        completePrompt: "Authentication is complete. Please finish your profile to use the service.",
        completeAction: "Complete sign up",
        welcome: (name?: string | null) => `Hello${name ? `, ${name}` : ""}!`,
        bioLabel: "Bio",
        noBio: "No bio has been added.",
        kakao: "Continue with Kakao",
        google: "Continue with Google",
        emailPlaceholder: "Email address",
        passwordPlaceholder: "Password",
        submitting: "Processing...",
        emailSignup: "Sign up with email",
        emailLogin: "Log in with email",
        hasAccount: "Already have an account?",
        noAccount: "Need an account?",
        switchToLogin: "Log in",
        switchToSignup: "Sign up",
        emailRequired: "Please enter your email and password.",
        passwordMin: "Password must be at least 6 characters.",
        signupDone: "Sign up is complete. You are now logged in.",
        genericError: "Something went wrong.",
    },
    contact: {
        title: "IYOHOUSE is open to new connections",
        email: "Email",
        subject: "Subject",
        message: "Message",
        required: "Please enter your email and message.",
        success: "Your message has been sent. We will get back to you soon.",
        error: "Something went wrong while sending. Please try again later.",
        sending: "Sending...",
        send: "Send",
    },
    workshop: {
        scheduleSelect: "Select schedule",
        closed: "Closed",
        apply: "Apply",
        legacyTitle: (id: number | string) => `AI.zip ${id} Graphic`,
        fallbackTitle: (id?: number | string | null) => `Workshop${id ? ` ${id}` : ""}`,
        tutorLabel: (name: string) => `Tutor : ${name}`,
        curriculum: "Curriculum",
        capacityLabel: (count: number) => `Capacity ${count} people`,
        priceLabel: (amount?: number | null) => typeof amount === "number" ? `KRW ${amount.toLocaleString()}` : "",
        missingDbId: "This workshop is not available yet. (Missing DB UUID)",
        closedAlert: "This workshop is already closed.",
        scheduleRequired: "Please select a schedule first.",
        paymentMisconfigured: "The payment system is not configured correctly. Please contact the administrator.",
        paymentPreparing: "The payment system is getting ready. Please try again shortly.",
        requestError: "The request failed",
        refundPolicy: {
            title: "Cancellation And Refund Policy",
            intro: [
                "This policy applies to paid workshops, classes, and group programs hosted by IYOHOUSE.",
                "If applicable law or consumer dispute resolution standards are more favorable to participants than this policy, those standards take precedence.",
                "The refund request time is based on when IYOHOUSE confirms the cancellation request through an official channel such as email, an application form, or Channel Talk.",
            ],
            sections: [
                {
                    title: "Cancellation By Participant",
                    items: [
                        { label: "Before the workshop starts:", text: "Full refund of the participation fee" },
                        { label: "Before 1/3 of the total workshop time has passed:", text: "Refund of 2/3 of the participation fee" },
                        { label: "Before 1/2 of the total workshop time has passed:", text: "Refund of 1/2 of the participation fee" },
                        { label: "After 1/2 of the total time has passed or in case of no-show:", text: "No refund" },
                        { text: "For multi-session workshops, the refundable amount for the period that includes the cancelled session and any remaining sessions that have not started will be combined." },
                    ] as RefundListItem[],
                },
                {
                    title: "Materials, Kits, And Textbooks",
                    items: [
                        { text: "For cancellations before the workshop starts, unused and unreceived material fees are refundable." },
                        { text: "Kits or textbooks that have already been shipped may be refunded after unopened return is confirmed, and return shipping is paid by the participant." },
                        { text: "For custom-made materials, food ingredients, fresh flowers, custom prints, or other materials that are difficult to resell, actual costs may be deducted if this was announced on the application page in advance." },
                    ] as RefundListItem[],
                },
                {
                    title: "Cancellation Or Changes By IYOHOUSE",
                    items: [
                        { text: "If a workshop is cancelled due to IYOHOUSE circumstances such as insufficient enrollment, tutor availability, or venue issues, the participation fee will be fully refunded." },
                        { text: "If the schedule changes, participants may choose either the changed schedule or a full refund." },
                        { text: "External costs such as transportation or accommodation are not compensated unless IYOHOUSE has explicitly announced otherwise." },
                    ] as RefundListItem[],
                },
                {
                    title: "Transfer And Schedule Changes",
                    items: [
                        { text: "Participants may transfer their spot to another person by contacting IYOHOUSE before the workshop starts." },
                        { text: "If another schedule for the same workshop is available, we can help with one schedule change. Changes may not be possible when no seats remain or material preparation has already been completed." },
                    ] as RefundListItem[],
                },
                {
                    title: "Refund Processing",
                    items: [
                        { text: "Card payments are generally cancelled through the original payment method." },
                        { text: "Bank transfer refunds are processed after refund account information is confirmed." },
                        { text: "Refunds are processed within 3 to 7 business days from receipt, and the actual deposit or card approval cancellation date may vary depending on the card company or payment gateway." },
                    ] as RefundListItem[],
                },
                {
                    title: "Contact And Requests",
                    body: "Please submit refund or change requests through the official channel below.",
                    contactEmailLabel: "Email",
                },
            ] as RefundSection[],
        },
    },
    footer: {
        company: "IYOHOUSE Inc.",
        address: "ADDRESS : 3F, 29 Huiujeong-ro 5-gil, Mapo-gu, Seoul",
        businessLicense: "BUSINESS LICENSE : 718-88-02112",
        mallOrderLicense: "MALL-ORDER LICENSE : 2024-Seoul Songpa-2708",
        email: "EMAIL : goyangiyoram@gmail.com",
        websiteDesign: "Website design : Eo Jun",
    },
};

export const TEXT = {
    ko,
    en,
} satisfies Record<Language, Translation>;

export function isLanguage(value: unknown): value is Language {
    return LANGUAGES.includes(value as Language);
}
