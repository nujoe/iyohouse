"use client";

import { memo, useMemo } from "react";

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

    const calendarDays = useMemo(() => {
        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth();

        const now = new Date();
        const todayYear = now.getFullYear();
        const todayMonth = now.getMonth();
        const todayDate = now.getDate();

        const firstDay = (new Date(year, month, 1).getDay() + 6) % 7;
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const prevMonthDays = new Date(year, month, 0).getDate();

        return Array.from({ length: 42 }).map((_, i) => {
            const dayNum = i - firstDay + 1;
            const isCurrMonth = dayNum >= 1 && dayNum <= daysInMonth;
            const displayNum = isCurrMonth ? dayNum : (dayNum <= 0 ? prevMonthDays + dayNum : dayNum - daysInMonth);

            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
            const dayEvents = isCurrMonth ? calendarEvents.filter(e => e.date === dateStr) : [];
            const isToday = isCurrMonth && year === todayYear && month === todayMonth && dayNum === todayDate;

            return {
                displayNum,
                isCurrMonth,
                isToday,
                dayEvents,
                key: i
            };
        });
    }, [currentMonth, calendarEvents]);

    return (
        <div className="calendar-container">
            <header className="calendar-header">
                <div className="month-title">
                    {currentMonth.toLocaleString('en-US', { month: 'long', year: 'numeric' })}
                </div>
                <div className="calendar-nav">
                    <button className="nav-btn today" onClick={() => onMonthChange(new Date())}>today</button>
                    <button className="nav-btn prev" onClick={() => onMonthChange(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}>prev</button>
                    <button className="nav-btn next" onClick={() => onMonthChange(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}>next</button>
                </div>
            </header>

            <div className="calendar-grid-header">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                    <div key={day} className="grid-header-cell">{day}</div>
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
