"use client";

import { memo, useEffect, useMemo, useState } from "react";

interface CalendarViewProps {
    currentMonth: Date;
    onMonthChange: (date: Date) => void;
    calendarEvents: any[];
}

function CalendarView({
    currentMonth,
    onMonthChange,
    calendarEvents
}: CalendarViewProps) {
    const [today, setToday] = useState<Date | null>(null);

    useEffect(() => {
        setToday(new Date());
    }, []);

    const calendarDays = useMemo(() => {
        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth();

        const todayYear = today?.getFullYear();
        const todayMonth = today?.getMonth();
        const todayDate = today?.getDate();

        const firstDay = (new Date(year, month, 1).getDay() + 6) % 7;
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const prevMonthDays = new Date(year, month, 0).getDate();

        return Array.from({ length: 42 }).map((_, i) => {
            const dayNum = i - firstDay + 1;
            const isCurrMonth = dayNum >= 1 && dayNum <= daysInMonth;
            const displayNum = isCurrMonth ? dayNum : (dayNum <= 0 ? prevMonthDays + dayNum : dayNum - daysInMonth);

            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
            const dayEvents = isCurrMonth ? calendarEvents.filter(e => e.date === dateStr) : [];
            const isToday = Boolean(today) && isCurrMonth && year === todayYear && month === todayMonth && dayNum === todayDate;

            return {
                displayNum,
                isCurrMonth,
                isToday,
                dayEvents,
                key: i
            };
        });
    }, [currentMonth, calendarEvents, today]);

    const todayDayIndex = useMemo(() => {
        return today ? (today.getDay() + 6) % 7 : null;
    }, [today]);

    return (
        <div className="calendar-container">
            <header className="calendar-header">
                <div className="month-title">
                    <span className="year-sub">{currentMonth.getFullYear()}</span>
                    <span className="month-main">{currentMonth.toLocaleString('en-US', { month: 'long' })}</span>
                </div>
                <div className="calendar-nav">
                    <button className="nav-btn today" onClick={() => onMonthChange(new Date())}>today</button>
                    <button className="nav-btn prev" onClick={() => onMonthChange(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}>prev</button>
                    <button className="nav-btn next" onClick={() => onMonthChange(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}>next</button>
                </div>
            </header>

            <div className="calendar-grid-header">
                {['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((day, index) => (
                    <div
                        key={day}
                        className={`grid-header-cell ${index === todayDayIndex ? 'is-today-day' : ''}`}
                    >
                        {day}
                    </div>
                ))}
            </div>

            <div className="calendar-grid">
                {calendarDays.map((day) => (
                    <div key={day.key} className={`calendar-cell ${day.isCurrMonth ? 'in-month' : 'out-month'} ${day.isToday ? 'is-today' : ''}`}>
                        <div className={`date-marker ${day.dayEvents.length > 0 ? 'has-events' : ''}`}>
                            {day.displayNum}
                        </div>
                        {day.dayEvents.map((evt, idx) => (
                            <div key={idx} className="event-box" style={{ "--idx": idx } as any}>
                                {evt.title} {evt.time}
                            </div>
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
}

export default memo(CalendarView);
