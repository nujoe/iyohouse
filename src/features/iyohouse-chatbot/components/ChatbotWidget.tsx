"use client";

import { type CSSProperties, type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { chatbotConfig } from "../config";

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
  sources?: Array<{ title?: string; slug?: string; url?: string }>;
};

type HealthState = {
  llmMode?: string;
  wikiUrl?: string;
  pageSource?: string;
};

type ChatbotPosition = {
  x: number | null;
  y: number;
};

type ChatbotBounds = {
  minX: number;
  maxX: number;
};

type ChatbotStyle = CSSProperties & {
  "--iyo-chatbot-left": string;
  "--iyo-chatbot-y": string;
};

const idleMovementIntervalMs = 5200;
const movementViewportPadding = 16;
const infoBoundaryGap = 12;
const rightGridBoundaryGap = 14;

const FAQ_TEMPLATES = [
  {
    id: "faq-1",
    question: "워크숍을 신청했는데 제대로 신청이 된 건지 모르겠어요.",
    answer: "워크숍 신청이 열리면 2영업일 내로 구글폼을 작성하신 모든 분들께 입금/대기 안내 메일을 보내드립니다. 선착순으로 정원 내에 신청하신 분들께는 입금 안내 메일을, 그 후에 신청하신 분들께는 대기 안내 메일을 보내드립니다."
  },
  {
    id: "faq-2",
    question: "워크숍을 신청했는데, 일이 생겨서 참여가 어려울 것 같아요. 환불 가능한가요?",
    answer: "워크숍 오픈 3일 전까지 환불이 가능합니다. 예를 들어 워크숍 오픈일이 6월 5일이라면, 3일 전인 6월 2일 자정까지 이요하우스 인스타그램 DM(@iyohouse) 또는 메일(goyangiyoram@gmail.com)로 연락 주시면 전액 환불을 도와드립니다. 튜터와 다른 대기자 분들을 고려하여 그 이후로는 환불이 어려운 점 안내드립니다. 또한, 이요하우스의 모든 활동은 부분 환불이 불가능하다는 점 안내드립니다."
  },
  {
    id: "faq-3",
    question: "워크숍 이수를 증명할 수 있는 수료증 혹은 그에 준하는 서류를 발급 받을 수 있나요?",
    answer: "이요하우스는 교육기관이 아닌 독립 창작자 커뮤니티 및 워크숍 운영 공간으로, 별도의 공식 수료증이나 교육 이수증은 발급하고 있지 않습니다."
  }
];

const initialAssistantMessage: ChatMessage = {
  id: "hello",
  role: "assistant",
  text: "안녕하세요. 이요하우스 위키에서 공개된 문서를 찾아 답할게요.",
};

const maxStepSize = 80;

function getNextIdlePosition(bounds: ChatbotBounds, currentX: number | null): ChatbotPosition {
  const range = Math.max(0, bounds.maxX - bounds.minX);
  const fallbackX = Math.round(bounds.minX + range / 2);
  const baseX = currentX === null ? fallbackX : currentX;
  
  // -maxStepSize ~ +maxStepSize 범위에서 랜덤 스텝 생성
  const step = Math.round((Math.random() * 2 - 1) * maxStepSize);
  let nextX = baseX + step;
  
  // 바운더리 클램핑
  nextX = Math.max(bounds.minX, Math.min(bounds.maxX, nextX));

  return {
    x: nextX,
    y: 0,
  };
}

function resetIdlePosition(current: ChatbotPosition): ChatbotPosition {
  return current.x === null && current.y === 0 ? current : { x: null, y: 0 };
}

function getChatbotBounds(chatbotElement: HTMLElement | null): ChatbotBounds {
  const chatbotWidth = chatbotElement?.getBoundingClientRect().width || 88;
  const infoRect = document.querySelector(".info-bottom-text-wrapper")?.getBoundingClientRect();
  const rightGridRects = [
    ...Array.from(document.querySelectorAll(".top-v-3")),
    ...Array.from(document.querySelectorAll(".v-line")),
  ].map((element) => element.getBoundingClientRect());

  const rightGridLeft = rightGridRects.length
    ? Math.max(...rightGridRects.map((rect) => rect.left))
    : window.innerWidth - movementViewportPadding;
  const minX = Math.max(
    movementViewportPadding,
    infoRect ? infoRect.right + infoBoundaryGap : window.innerWidth * 0.38
  );
  const maxX = Math.min(
    window.innerWidth - chatbotWidth - movementViewportPadding,
    rightGridLeft - chatbotWidth - rightGridBoundaryGap
  );

  if (maxX <= minX) {
    const fallbackX = Math.max(
      movementViewportPadding,
      Math.min(window.innerWidth - chatbotWidth - movementViewportPadding, window.innerWidth * 0.53 - 124)
    );

    return { minX: fallbackX, maxX: fallbackX };
  }

  return { minX, maxX };
}

export default function ChatbotWidget() {
  const chatbotRef = useRef<HTMLDivElement>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAsking, setIsAsking] = useState(false);
  const [question, setQuestion] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [health, setHealth] = useState<HealthState | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([initialAssistantMessage]);
  const [position, setPosition] = useState<ChatbotPosition>({ x: null, y: 0 });
  const settingsEnabled = chatbotConfig.settingsEnabled;



  useEffect(() => {
    setIsMounted(true);
    setApiKey(window.localStorage.getItem(chatbotConfig.apiKeyStorageKey) || "");
  }, []);

  useEffect(() => {
    if (!isMounted || !chatbotConfig.enabled) return;

    fetch("/api/chatbot/health", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setHealth(data);
      })
      .catch(() => {
        setMessages((current) => [
          ...current,
          {
            id: `offline-${Date.now()}`,
            role: "assistant",
            text: "챗봇 하네스가 아직 연결되지 않았어요. sidecar 서버를 켜면 다시 시도할 수 있습니다.",
          },
        ]);
      });
  }, [isMounted]);

  useEffect(() => {
    if (!isMounted || isOpen || isSettingsOpen || isAsking) {
      setPosition(resetIdlePosition);
      return;
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const timer = window.setInterval(() => {
      setPosition((current) => {
        const bounds = getChatbotBounds(chatbotRef.current);
        return getNextIdlePosition(bounds, current.x);
      });
    }, idleMovementIntervalMs);

    return () => window.clearInterval(timer);
  }, [isMounted, isOpen, isSettingsOpen, isAsking]);

  if (!isMounted || !chatbotConfig.enabled) return null;

  const submitQuestion = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || isAsking) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      text: trimmed,
    };
    const pendingId = `assistant-${Date.now()}`;

    setQuestion("");
    setIsAsking(true);
    setMessages((current) => [
      ...current,
      userMessage,
      { id: pendingId, role: "assistant", text: "위키를 살펴보고 있어요." },
    ]);

    try {
      const payload: Record<string, unknown> = {
        question: trimmed,
        includeTrace: settingsEnabled,
      };
      if (settingsEnabled && apiKey.trim()) {
        payload.geminiApiKey = apiKey.trim();
        window.localStorage.setItem(chatbotConfig.apiKeyStorageKey, apiKey.trim());
      }

      const response = await fetch("/api/chatbot/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok || result.error) {
        throw new Error(result.detail || result.error || "챗봇 요청에 실패했습니다.");
      }

      setMessages((current) =>
        current.map((message) =>
          message.id === pendingId
            ? {
                ...message,
                text: result.answer || "답변을 만들지 못했어요.",
                sources: Array.isArray(result.sources) ? result.sources : [],
              }
            : message
        )
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
      setMessages((current) =>
        current.map((entry) =>
          entry.id === pendingId
            ? { ...entry, text: `연결 중 문제가 생겼어요. ${message}` }
            : entry
        )
      );
    } finally {
      setIsAsking(false);
    }
  };

  const handleFaqClick = (faq: typeof FAQ_TEMPLATES[0]) => {
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      text: faq.question,
    };
    const assistantMessage: ChatMessage = {
      id: `assistant-${Date.now()}`,
      role: "assistant",
      text: faq.answer,
    };
    setMessages((current) => [...current, userMessage, assistantMessage]);
  };

  const chatbotStyle: ChatbotStyle = {
    "--iyo-chatbot-left": position.x === null ? "calc(53vw - 124px)" : `${position.x}px`,
    "--iyo-chatbot-y": `${position.y}px`,
  };

  return (
    <div className="iyo-chatbot" ref={chatbotRef} style={chatbotStyle}>
      <button
        className="iyo-chatbot-avatar"
        type="button"
        aria-label="이요하우스 챗봇 열기"
        aria-expanded={isOpen}
        onClick={() => {
          setIsOpen((value) => {
            const nextValue = !value;
            if (nextValue) {
              setMessages([initialAssistantMessage]);
            }
            return nextValue;
          });
        }}
      >
          <img src="/logo.png" alt="iyohouse logo" className="iyo-chatbot-logo-img" />
      </button>

      {isOpen && (
        <section className="iyo-chatbot-popover" aria-label="이요하우스 챗봇">
          <div className="iyo-chatbot-header">
            <div>
              <p>iyohouse 챗봇</p>
            </div>
            {messages.length > 1 ? (
              <button
                type="button"
                onClick={() => setMessages([initialAssistantMessage])}
                aria-label="처음 화면으로 돌아가기"
              >
                ←
              </button>
            ) : (
              <button type="button" onClick={() => setIsOpen(false)} aria-label="챗봇 닫기">
                ×
              </button>
            )}
          </div>

          <div className="iyo-chatbot-messages" aria-live="polite">
            {messages.map((message) => (
              <div key={message.id} className={`iyo-chatbot-message is-${message.role}`}>
                <p>{message.text}</p>
                {message.sources && message.sources.length > 0 && (
                  <div className="iyo-chatbot-sources">
                    {message.sources.map((source) => (
                      <a
                        key={source.slug || source.title}
                        href={source.url || "#"}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {source.title || source.slug}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {messages.length === 1 && (
              <div className="iyo-chatbot-faqs">
                {FAQ_TEMPLATES.map((faq) => (
                  <button
                    key={faq.id}
                    type="button"
                    className="iyo-chatbot-faq-btn"
                    onClick={() => handleFaqClick(faq)}
                  >
                    {faq.question}
                  </button>
                ))}
              </div>
            )}
          </div>

          <form className="iyo-chatbot-form" onSubmit={submitQuestion}>
            <input
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="위키에 물어보기"
              disabled={isAsking}
            />
            <button type="submit" disabled={isAsking || !question.trim()}>
              전송
            </button>
          </form>
        </section>
      )}

      {settingsEnabled && (
        <button
          className="iyo-chatbot-settings-toggle"
          type="button"
          onClick={() => setIsSettingsOpen((value) => !value)}
        >
          settings
        </button>
      )}

      {settingsEnabled && isSettingsOpen && (
        <aside className="iyo-chatbot-settings" aria-label="챗봇 설정">
          <div className="iyo-chatbot-header">
            <div>
              <p>test settings</p>
              <strong>Gemini API key</strong>
            </div>
            <button type="button" onClick={() => setIsSettingsOpen(false)} aria-label="설정 닫기">
              ×
            </button>
          </div>
          <input
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="AIza..."
            autoComplete="off"
          />
          <button
            type="button"
            onClick={() => {
              if (apiKey.trim()) window.localStorage.setItem(chatbotConfig.apiKeyStorageKey, apiKey.trim());
              else window.localStorage.removeItem(chatbotConfig.apiKeyStorageKey);
            }}
          >
            저장
          </button>
        </aside>
      )}
    </div>
  );
}
