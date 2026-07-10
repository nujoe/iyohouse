"use client";

import { memo, useEffect, useMemo, useState, useRef, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { sortCalendarEventsByStartTime } from "@/lib/calendarEventOrder";

interface CalendarViewProps {
    currentMonth: Date;
    onMonthChange: (date: Date) => void;
    calendarEvents: any[];
}

const getAuthorColor = (author?: string) => {
    switch (author) {
        case "준":
            return "var(--tag-red)";
        case "현":
            return "var(--tag-green)";
        case "가은":
            return "var(--tag-blue)";
        case "가현":
            return "var(--tag-purple)";
        case "연서":
            return "var(--tag-yellow)";
        default:
            return "transparent";
    }
};

function PopoverCard({ activeEvent, onClose }: { activeEvent: { event: any; rect: DOMRect; clickedDate?: string }; onClose: () => void }) {
    const [coords, setCoords] = useState({ top: 0, left: 0 });
    const cardRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!cardRef.current) return;
        const cardWidth = 260; // Fixed width
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;

        const rect = activeEvent.rect;

        // X position calculation (centered on event, clamped to viewport borders)
        let left = rect.left + rect.width / 2 - cardWidth / 2;
        if (left < 10) {
            left = 10;
        } else if (left + cardWidth > windowWidth - 10) {
            left = windowWidth - cardWidth - 10;
        }

        // Y position calculation
        const cardHeight = cardRef.current.offsetHeight || 150;
        let top = rect.bottom + 8;
        if (top + cardHeight > windowHeight - 10) {
            // Place above the event box if not enough space below
            top = rect.top - cardHeight - 8;
        }
        if (top < 10) {
            top = Math.max(10, (windowHeight - cardHeight) / 2);
        }

        setCoords({ top, left });
    }, [activeEvent]);

    const { title, date, time, description, author } = activeEvent.event;
    const displayDate = activeEvent.clickedDate || date;

    return (
        <div
            ref={cardRef}
            className="calendar-popover-card"
            style={{
                position: 'fixed',
                top: `${coords.top}px`,
                left: `${coords.left}px`,
                width: '260px',
                zIndex: 12501,
                pointerEvents: 'auto',
            }}
        >
            <div className="popover-header">
                {author && (
                    <span 
                        className="event-author-dot" 
                        style={{ backgroundColor: getAuthorColor(author), marginRight: '6px', flexShrink: 0 }}
                    />
                )}
                <span className="popover-title">{title}</span>
            </div>
            <div className="popover-body">
                <div className="popover-meta">
                    <span className="popover-date">{displayDate}</span>
                    {time && <span className="popover-time">{time}</span>}
                    {author && <span className="popover-author">작성자: {author}</span>}
                </div>
                {description && (
                    <p className="popover-desc">{description}</p>
                )}
            </div>
        </div>
    );
}

function CalendarView({
    currentMonth,
    onMonthChange,
    calendarEvents
}: CalendarViewProps) {
    const [today, setToday] = useState<Date | null>(null);
    const [activeEvent, setActiveEvent] = useState<{ event: any; rect: DOMRect; clickedDate?: string } | null>(null);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setToday(new Date());
        setMounted(true);
    }, []);

    const calendar = useMemo(() => {
        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth();

        const todayYear = today?.getFullYear();
        const todayMonth = today?.getMonth();
        const todayDate = today?.getDate();

        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const prevMonthDays = new Date(year, month, 0).getDate();
        const weekCount = Math.ceil((firstDay + daysInMonth) / 7);

        const days = Array.from({ length: weekCount * 7 }).map((_, i) => {
            const dayNum = i - firstDay + 1;
            const isCurrMonth = dayNum >= 1 && dayNum <= daysInMonth;
            const displayNum = isCurrMonth ? dayNum : (dayNum <= 0 ? prevMonthDays + dayNum : dayNum - daysInMonth);

            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
            const dayEvents = isCurrMonth
                ? sortCalendarEventsByStartTime(
                    calendarEvents.filter(e => {
                        if (e.date === dateStr) return true;
                        if (Array.isArray(e.dates) && e.dates.includes(dateStr)) return true;
                        return false;
                    }),
                )
                : [];
            const isToday = Boolean(today) && isCurrMonth && year === todayYear && month === todayMonth && dayNum === todayDate;

            return {
                displayNum,
                isCurrMonth,
                isToday,
                dayEvents,
                dateStr,
                key: i
            };
        });

        return { days, weekCount };
    }, [currentMonth, calendarEvents, today]);

    const todayDayIndex = useMemo(() => {
        return today ? today.getDay() : null;
    }, [today]);

    const handleEventClick = (e: React.MouseEvent, evt: any, clickedDate: string) => {
        e.stopPropagation();
        const rect = e.currentTarget.getBoundingClientRect();
        setActiveEvent({ event: evt, rect, clickedDate });
    };

    return (
        <div className="calendar-container">
            <header className="calendar-header">
                <div className="month-title">
                    <span className="year-sub">{currentMonth.getFullYear()}</span>
                    <span className="month-main">{currentMonth.toLocaleString('en-US', { month: 'long' })}</span>
                </div>
                <div className="calendar-nav">
                    <button className="nav-btn today" onClick={() => onMonthChange(new Date())}>today</button>
                    <button className="nav-btn prev" onClick={() => onMonthChange(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}>&lt;</button>
                    <button className="nav-btn next" onClick={() => onMonthChange(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}>&gt;</button>
                </div>
            </header>

            <div className="calendar-grid-header">
                {['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map((day, index) => (
                    <div
                        key={day}
                        className={`grid-header-cell ${index === todayDayIndex ? 'is-today-day' : ''}`}
                    >
                        {day}
                    </div>
                ))}
            </div>

            <div
                className="calendar-grid"
                style={{ "--calendar-week-count": calendar.weekCount } as CSSProperties}
            >
                {calendar.days.map((day) => (
                    <div key={day.key} className={`calendar-cell ${day.isCurrMonth ? 'in-month' : 'out-month'} ${day.isToday ? 'is-today' : ''}`}>
                        <div className={`date-marker ${day.dayEvents.length > 0 ? 'has-events' : ''}`}>
                            {day.displayNum}
                        </div>
                        {day.dayEvents.map((evt, idx) => (
                            <div
                                key={idx}
                                className="event-box"
                                style={{ "--idx": idx } as any}
                                onClick={(e) => handleEventClick(e, evt, day.dateStr)}
                            >
                                {evt.author && (
                                    <span
                                        className="event-author-dot"
                                        style={{ backgroundColor: getAuthorColor(evt.author) }}
                                    />
                                )}
                                <span className="event-title-text">{evt.title}</span>
                            </div>
                        ))}
                    </div>
                ))}
            </div>

            {activeEvent && mounted && createPortal(
                <>
                    <div
                        className="calendar-popover-overlay"
                        onClick={() => setActiveEvent(null)}
                    />
                    <PopoverCard
                        activeEvent={activeEvent}
                        onClose={() => setActiveEvent(null)}
                    />
                </>,
                document.body
            )}
        </div>
    );
}

export default memo(CalendarView);
