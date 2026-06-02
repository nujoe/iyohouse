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

const initialAssistantMessage: ChatMessage = {
  id: "hello",
  role: "assistant",
  text: "안녕하세요. 이요하우스 위키에서 공개된 문서를 찾아 답할게요.",
};

function getNextIdlePosition(bounds: ChatbotBounds): ChatbotPosition {
  const range = Math.max(0, bounds.maxX - bounds.minX);

  return {
    x: Math.round(bounds.minX + Math.random() * range),
    y: 0,
  };
}

function resetIdlePosition(current: ChatbotPosition): ChatbotPosition {
  return current.x === null && current.y === 0 ? current : { x: null, y: 0 };
}

function getChatbotBounds(chatbotElement: HTMLElement | null): ChatbotBounds {
  const chatbotWidth = chatbotElement?.getBoundingClientRect().width || 122;
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

  const statusText = useMemo(() => {
    if (!health) return "sidecar 확인 중";
    return [health.pageSource, health.llmMode].filter(Boolean).join(" · ") || "wiki harness";
  }, [health]);

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
      setPosition(getNextIdlePosition(getChatbotBounds(chatbotRef.current)));
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
        onClick={() => setIsOpen((value) => !value)}
      >
        <span className="iyo-chatbot-face">(=ˆ ･ ˆ=)</span>
        <span className="iyo-chatbot-tail" aria-hidden="true">
          ⌒
        </span>
      </button>

      {isOpen && (
        <section className="iyo-chatbot-popover" aria-label="이요하우스 챗봇">
          <div className="iyo-chatbot-header">
            <div>
              <p>iyohouse wiki</p>
              <strong>{statusText}</strong>
            </div>
            <button type="button" onClick={() => setIsOpen(false)} aria-label="챗봇 닫기">
              ×
            </button>
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
