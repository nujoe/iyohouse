"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";

type AccountWorkshopHistoryItem = {
  id: string;
  title: string;
  tutor: string;
  description: string;
  posterUrl: string;
  posterAlt: string;
  posterWidth: number;
  posterHeight: number;
};

type AccountWorkshopHistoryProps = {
  isActive: boolean;
  profileName?: string | null;
  accessToken?: string | null;
};

type LoadState = "idle" | "loading" | "ready" | "error";

export default function AccountWorkshopHistory({
  isActive,
  profileName,
  accessToken,
}: AccountWorkshopHistoryProps) {
  const [items, setItems] = useState<AccountWorkshopHistoryItem[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("idle");

  useEffect(() => {
    if (!isActive) {
      setItems([]);
      setLoadState("idle");
      return;
    }

    const controller = new AbortController();

    async function loadHistory() {
      setLoadState("loading");

      try {
        const response = await fetch("/api/account/workshop-history", {
          method: "GET",
          cache: "no-store",
          signal: controller.signal,
          headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
        });

        if (!response.ok) {
          throw new Error("Failed to load account workshop history");
        }

        const payload = await response.json();
        setItems(Array.isArray(payload.items) ? payload.items : []);
        setLoadState("ready");
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("Account workshop history load failed:", error);
        setLoadState("error");
      }
    }

    void loadHistory();

    return () => controller.abort();
  }, [accessToken, isActive]);

  const displayName = profileName?.trim() || "회원";

  return (
    <section className="account-history-panel" aria-labelledby="account-history-title">
      <div className="account-history-heading">
        <h3 id="account-history-title">iyohouse</h3>
        <p className="account-history-greeting">
          <strong>{displayName}님</strong> 안녕하세요 !
        </p>
        <p className="account-history-copy">
          이 페이지에서는 지금까지의 워크숍 신청 내역을 확인하실 수 있습니다
        </p>
      </div>

      <div className="account-history-divider" aria-hidden="true" />

      {loadState === "loading" && (
        <div className="account-history-status">신청 내역을 불러오는 중입니다.</div>
      )}

      {loadState === "error" && (
        <div className="account-history-status">신청 내역을 불러오지 못했습니다.</div>
      )}

      {loadState === "ready" && items.length === 0 && (
        <div className="account-history-status">확정된 워크숍 신청 내역이 없습니다.</div>
      )}

      {items.length > 0 && (
        <div className="account-history-list">
          {items.map((item, index) => {
            const itemClassName = index % 2 === 1
              ? "workshop-history-item is-reversed"
              : "workshop-history-item";
            const posterRatio = `${item.posterWidth} / ${item.posterHeight}`;

            return (
              <article className={itemClassName} key={item.id}>
                <div
                  className="workshop-history-poster"
                  style={{ "--poster-ratio": posterRatio } as CSSProperties}
                >
                  {item.posterUrl ? (
                    <Image
                      src={item.posterUrl}
                      alt={item.posterAlt}
                      width={item.posterWidth}
                      height={item.posterHeight}
                      sizes="(max-width: 600px) 100vw, 280px"
                    />
                  ) : (
                    <div className="workshop-history-poster-placeholder" aria-label="포스터 이미지 없음" />
                  )}
                </div>
                <div className="workshop-history-detail">
                  <h4>{item.title}</h4>
                  <p><span className="history-label">튜터 : </span><span className="history-value">{item.tutor || "-"}</span></p>
                  <p className="workshop-history-description"><span className="history-label">워크숍 소개 : </span><span className="history-value">{item.description || "-"}</span></p>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
