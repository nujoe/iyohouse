const presets = {
    main: {
        line1: "calc(100% - 21px)",
        line2: "calc(100% - 14px)",
        line3: "calc(100% - 7px)",
        top2: "calc(var(--top-row-1) + 7px)"
    },
    about: {
        line1: "0px",
        line2: "calc(100% - 14px)",
        line3: "calc(100% - 7px)",
        top2: "calc(100% - 7px)"
    },
    workshop: {
        line1: "calc(100% - 21px)",
        line2: "calc(100% - 14px)",
        line3: "calc(100% - 7px)",
        top2: "calc(100% - 7px)"
    },
    club: {
        line1: "0px",
        line2: "7px",
        line3: "calc(100% - 7px)",
        top2: "calc(100% - 7px)"
    },
    diary: {
        line1: "0px",
        line2: "7px",
        line3: "14px",
        top2: "calc(100% - 7px)"
    }
};

// 채도 높은 랜덤 색상 생성 (HSL 사용)
function randomColor() {
    const h = Math.floor(Math.random() * 360);
    return `hsl(${h}, 90%, 50%)`;
}

const root = document.documentElement;
const buttons = document.querySelectorAll("[data-preset]");

buttons.forEach((button) => {
    button.addEventListener("click", () => {
        const presetName = button.dataset.preset;
        const preset = presets[presetName];

        root.style.setProperty("--line-x-1", preset.line1);
        root.style.setProperty("--line-x-2", preset.line2);
        root.style.setProperty("--line-x-3", preset.line3);
        root.style.setProperty("--top-row-2", preset.top2);
        root.style.setProperty("--intersect", randomColor());

        // Update active class on cells
        document.querySelectorAll('.cell').forEach(cell => {
            cell.classList.remove('active');
        });
        const activeCell = document.querySelector(`.cell-${presetName}`);
        if (activeCell) {
            activeCell.classList.add('active');
        }

        // Update active class on buttons
        buttons.forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
    });
});

// --- Network Model ---
const NUM_NODES = 17;
const nodesContainer = document.getElementById("nodesContainer");
const canvas = document.getElementById("edgeCanvas");
let ctx;
if (canvas) {
    ctx = canvas.getContext("2d");
}

let nodes = [];
let edges = [];
let animationId;
let draggedNode = null;

function initNetwork() {
    if (!canvas || !nodesContainer) return;

    // Clear previous
    nodesContainer.innerHTML = '';
    nodes = [];
    edges = [];
    draggedNode = null;

    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;

    // Create Nodes
    for (let i = 1; i <= NUM_NODES; i++) {
        const isCenter = i === 17;
        const numStr = i.toString().padStart(2, '0');
        const imgSrc = `assets/${numStr}.png`;

        const el = document.createElement("div");
        el.className = "network-node";

        // Poster ratio (e.g. 1 : 1.4)
        const baseSize = 100; // All posters perfectly identical
        el.style.width = baseSize + "px";
        el.style.height = (baseSize * 1.4) + "px";

        const img = document.createElement("img");
        img.src = imgSrc;

        // Prevent default drag behavior on the image so our custom drag works smoothly
        img.addEventListener('dragstart', (e) => e.preventDefault());

        el.appendChild(img);
        nodesContainer.appendChild(el);

        // Spawn near center for a calm expansion
        let startX = cx;
        let startY = cy;
        if (!isCenter) {
            const angle = Math.random() * Math.PI * 2;
            const r = 30 + Math.random() * 80; // Tight cluster
            startX += Math.cos(angle) * r;
            startY += Math.sin(angle) * r;
        }

        const nodeObj = {
            id: i,
            isCenter: isCenter,
            x: startX,
            y: startY,
            vx: 0,
            vy: 0,
            el: el,
            baseSize: baseSize
        };

        // Mouse Down Event for Drag
        el.addEventListener('mousedown', (e) => {
            draggedNode = nodeObj;
            e.preventDefault(); // Prevent text selection
        });

        // Touch support
        el.addEventListener('touchstart', (e) => {
            draggedNode = nodeObj;
            e.preventDefault();
        }, { passive: false });

        nodes.push(nodeObj);
    }

    // Global Mouse Events for Drag
    window.addEventListener('mousemove', (e) => {
        if (draggedNode) {
            const rect = nodesContainer.getBoundingClientRect();
            draggedNode.x = e.clientX - rect.left;
            draggedNode.y = e.clientY - rect.top;
            draggedNode.vx = 0;
            draggedNode.vy = 0;
        }
    });

    window.addEventListener('mouseup', () => {
        draggedNode = null;
    });

    window.addEventListener('mouseleave', () => {
        draggedNode = null;
    });

    // Global Touch Events for Drag
    window.addEventListener('touchmove', (e) => {
        if (draggedNode && e.touches.length > 0) {
            const rect = nodesContainer.getBoundingClientRect();
            const touch = e.touches[0];
            draggedNode.x = touch.clientX - rect.left;
            draggedNode.y = touch.clientY - rect.top;
            draggedNode.vx = 0;
            draggedNode.vy = 0;
        }
    }, { passive: false });

    window.addEventListener('touchend', () => {
        draggedNode = null;
    });

    window.addEventListener('touchcancel', () => {
        draggedNode = null;
    });

    // Generate Spanning Tree for connectivity
    const unvisited = [...nodes];
    const visited = [];

    const startIndex = unvisited.findIndex(n => n.isCenter);
    visited.push(unvisited.splice(startIndex, 1)[0]);

    while (unvisited.length > 0) {
        const u = visited[Math.floor(Math.random() * visited.length)];
        const vIdx = Math.floor(Math.random() * unvisited.length);
        const v = unvisited.splice(vIdx, 1)[0];
        edges.push({ source: u, target: v });
        visited.push(v);
    }

    // Add Erdos-Renyi random edges
    for (let i = 0; i < NUM_NODES; i++) {
        for (let j = i + 1; j < NUM_NODES; j++) {
            if (Math.random() < 0.12) {
                const exists = edges.find(e =>
                    (e.source.id === nodes[i].id && e.target.id === nodes[j].id) ||
                    (e.source.id === nodes[j].id && e.target.id === nodes[i].id)
                );
                if (!exists) {
                    edges.push({ source: nodes[i], target: nodes[j] });
                }
            }
        }
    }

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    if (animationId) cancelAnimationFrame(animationId);
    loop();
}

function resizeCanvas() {
    if (!canvas) return;
    const container = canvas.parentElement;
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
}

function loop() {
    updatePhysics();
    drawNetwork();
    animationId = requestAnimationFrame(loop);
}

function updatePhysics() {
    if (!canvas) return;
    const width = canvas.width;
    const height = canvas.height;

    const cx = width / 2;
    const cy = height / 2;

    // Repulsion
    for (let i = 0; i < NUM_NODES; i++) {
        for (let j = i + 1; j < NUM_NODES; j++) {
            let dx = nodes[j].x - nodes[i].x;
            let dy = nodes[j].y - nodes[i].y;
            let distSq = dx * dx + dy * dy;
            if (distSq === 0) {
                dx = Math.random() - 0.5; dy = Math.random() - 0.5;
                distSq = dx * dx + dy * dy;
            }
            let dist = Math.sqrt(distSq);
            let force = 25000 / distSq;

            // Limit repulsion extremely at very close distances to avoid explosions
            if (dist < 30) force = 25000 / (30 * 30);

            let fx = (dx / dist) * force;
            let fy = (dy / dist) * force;

            if (!nodes[i].isCenter && nodes[i] !== draggedNode) {
                nodes[i].vx -= fx;
                nodes[i].vy -= fy;
            }
            if (!nodes[j].isCenter && nodes[j] !== draggedNode) {
                nodes[j].vx += fx;
                nodes[j].vy += fy;
            }
        }
    }

    // Springs
    edges.forEach(e => {
        let dx = e.target.x - e.source.x;
        let dy = e.target.y - e.source.y;
        let dist = Math.sqrt(dx * dx + dy * dy);
        let force = (dist - 110) * 0.01; // relaxed spring distance
        let fx = (dx / dist) * force;
        let fy = (dy / dist) * force;

        if (!e.source.isCenter && e.source !== draggedNode) {
            e.source.vx += fx;
            e.source.vy += fy;
        }
        if (!e.target.isCenter && e.target !== draggedNode) {
            e.target.vx -= fx;
            e.target.vy -= fy;
        }
    });

    // Center gravity
    nodes.forEach(n => {
        if (!n.isCenter && n !== draggedNode) {
            let dx = cx - n.x;
            let dy = cy - n.y;
            n.vx += dx * 0.005;
            n.vy += dy * 0.005;
        }
    });

    // Update positions
    nodes.forEach(n => {
        if (n.isCenter && n !== draggedNode) {
            // Smoothly move center node back to center if it was dragged
            n.x += (cx - n.x) * 0.05;
            n.y += (cy - n.y) * 0.05;
            n.vx = 0;
            n.vy = 0;
        } else if (n !== draggedNode) {
            // Apply velocity cap for calmer movement
            const maxV = 8;
            if (n.vx > maxV) n.vx = maxV;
            if (n.vx < -maxV) n.vx = -maxV;
            if (n.vy > maxV) n.vy = maxV;
            if (n.vy < -maxV) n.vy = -maxV;

            n.vx *= 0.85; // Damping
            n.vy *= 0.85;
            n.x += n.vx;
            n.y += n.vy;

            // Container limits
            const padding = 50;
            if (n.x < padding) { n.x = padding; n.vx *= -0.5; }
            if (n.x > width - padding) { n.x = width - padding; n.vx *= -0.5; }
            if (n.y < padding) { n.y = padding; n.vy *= -0.5; }
            if (n.y > height - padding) { n.y = height - padding; n.vy *= -0.5; }
        }
    });
}

function drawNetwork() {
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw edges
    ctx.beginPath();
    edges.forEach(e => {
        ctx.moveTo(e.source.x, e.source.y);
        ctx.lineTo(e.target.x, e.target.y);
    });

    const rootStyles = getComputedStyle(document.documentElement);
    let intersectColor = rootStyles.getPropertyValue('--intersect').trim() || '#2563eb';

    ctx.strokeStyle = intersectColor;
    ctx.lineWidth = 1.5;
    ctx.shadowBlur = 10;
    ctx.shadowColor = intersectColor;
    ctx.stroke();
    ctx.shadowBlur = 0; // Reset

    // Update DOM nodes
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const maxDist = Math.sqrt(cx * cx + cy * cy);

    nodes.forEach(n => {
        let scale = 1;

        // Visual feedback when dragging
        if (n === draggedNode) scale *= 1.1;

        n.el.style.left = n.x + 'px';
        n.el.style.top = n.y + 'px';
        n.el.style.transform = `translate(-50%, -50%) scale(${scale})`;

        let zPos = n.isCenter ? 100 : 50;
        n.el.style.zIndex = (n === draggedNode) ? 1000 : zPos;
    });
}

function initWorkshop() {
    const grid = document.getElementById("workshopGrid");
    if (!grid) return;
    grid.innerHTML = "";

    for (let i = 17; i >= 1; i--) {
        const numStr = i.toString().padStart(2, '0');
        const isClosed = i <= 11;
        
        const item = document.createElement("div");
        item.className = "workshop-item";
        
        const tagHtml = isClosed ? `<div class="tag-closed">마감</div>` : '';
        
        item.innerHTML = `
            <div class="blueprint-img-box">
                <img src="assets/${numStr}.png" loading="lazy" alt="Workshop ${numStr}">
            </div>
            <div class="blueprint-info">
                <div class="info-row">
                    <div class="title-wrap">
                        ${tagHtml}
                        <div class="title-box">AI.zip ${i} 그래픽</div>
                    </div>
                    <div class="color-dots">
                        <span class="dot-black">AI</span>
                        <span class="dot-yellow">WORKSHOP</span>
                        <span class="dot-green">GRAPHIC</span>
                    </div>
                </div>
                <hr class="blueprint-hr">
                <div class="tutor-box">
                    튜터 : 000 @asdf1234
                </div>
            </div>
        `;
        
        grid.appendChild(item);
    }
}

/* ─── 스크롤 연동 색상 변화 효과 ─── */
function initScrollColorEffect() {
    // 워크숍, 어바웃 등 스크롤이 있는 콘텐츠 영역을 모두 잡습니다
    const scrollableCells = document.querySelectorAll('.workshop-wrapper, .about-content');
    
    scrollableCells.forEach(container => {
        container.addEventListener('scroll', () => {
            const maxScroll = container.scrollHeight - container.clientHeight;
            if (maxScroll <= 0) return;
            const scrollPercent = container.scrollTop / maxScroll;
            
            // 0 ~ 360 스크롤에 따른 Hue(색상) 매칭
            const h = Math.floor(scrollPercent * 360 * 1.5) % 360; 
            
            // 1. 해당 셀의 배경색을 연한 파스텔 톤 틴트로 부드럽게 변경 (User requested to remove background tints)
            container.parentElement.style.backgroundColor = "transparent";
            
            // 2. 전체 그리드의 라인 교차점 테마 포인트 색상 동시 변경
            document.documentElement.style.setProperty("--intersect", `hsl(${h}, 90%, 50%)`);
        });
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initNetwork();
        initWorkshop();
        initScrollColorEffect();
    });
} else {
    initNetwork();
    initWorkshop();
    initScrollColorEffect();
}