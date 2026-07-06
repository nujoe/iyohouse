export const THEME_COLORS = [
    "#ff3838ff",
    "#ff00ff",
    "#00ffff",
    "#7cfc00",
    "#ff4500",
    "#1e90ff",
    "#f0f0f0ff",
];

export const noopScrollHandler = () => { };

export const HYDRATION_SAFE_CALENDAR_MONTH = new Date("2000-01-01T12:00:00.000Z");

export const getClientCurrentMonth = () => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
};
