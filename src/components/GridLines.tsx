export default function GridLines() {
    return (
        <>
            <div className="h-line grid-row-1"></div><div className="h-line grid-row-2"></div>

            {/* 풀 사이즈 수직선 */}
            <div className="v-line" style={{ left: 'var(--line-x-1)' }}></div>
            <div className="v-line" style={{ left: 'var(--line-x-2)' }}></div>
            <div className="v-line" style={{ left: 'var(--line-x-3)' }}></div>
            <div className="v-line v-line-center" style={{ left: 'var(--line-x-center)' }}></div>

            {/* 교차점 마커 (색상 블록) */}
            <div className="top-v-1"></div><div className="top-v-2"></div><div className="top-v-3"></div>
            <div className="top-v-center"></div>
        </>
    );
}
