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

export const getTagColor = (tag: string) => {
    const t = tag.toUpperCase().trim();
    if (t === 'WORKSHOP') return 'yellow';
    if (t === 'TALK') return 'blue';
    if (t === 'IYOCA') return 'green';
    return 'gray';
};

export const createLegacyWorkshop = (id: number) => ({
    id,
    isSanity: false,
    sortNum: id,
    title: `AI.zip ${id}`,
    tutor: "000 @asdf1234",
    price: 150000,
    capacity: 8,
    tags: ["AI", "WORKSHOP", "GRAPHIC"],
    isClosed: id <= 11,
});

export const getClientCurrentMonth = () => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
};
