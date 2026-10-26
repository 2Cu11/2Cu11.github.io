document.addEventListener('DOMContentLoaded', function () {
        /* ===== 可调参数 ===== */
        const W = 1670, H = 1169;   // 舞台尺寸
        const INIT = 1;             // 初始大小系数
        const SPEED1 = 0.5;         // box1 视差速度：0.5 = 以一半速度上移
        const SMOOTH = 0.3;         // 目标：每次滚动约在 1 秒内平滑完成
        // 由 SMOOTH 反推每 60fps 帧的缓动系数，使约 1 秒后剩余 ~2%（即基本到位）
        let EASE = 1 - Math.pow(0.02, 1 / (SMOOTH * 60));   // ≈0.063，越小越柔

    if (matchMedia('(prefers-reduced-motion: reduce)').matches) EASE = 1;

    /* ===== 点击 #ID（YourRoom）门时的下滑动画：下滑至 box2 顶部与浏览器顶部距离为 0 ===== */
    const AUTO_MS = 500;       // 动画时长(ms)：500 = 0.5 秒，可自行调整

    const baseDpr = window.devicePixelRatio;
    const box1 = document.querySelector('.box1');
    const box2 = document.querySelector('.box2');
    if (!box1) { console.error('找不到 .box1'); return; }
    if (!box2) console.warn('找不到 .box2，目前只处理 box1');

    const layers = box2 ? Array.from(box2.querySelectorAll('[data-speed]')) : [];
    let s = 1, left = 0, top1 = 0, top2 = 0;
    let current = window.scrollY;
    let running = false;
    let last = 0;               // 上一帧时间戳，用于帧率无关缓动
    let refFrom = 0;            // 本次平滑滚动的起始动画位置
    let gap = 0;                // 本次要移动的总距离（用于相对停止阈值）

    /* ===== 点击 #ID（YourRoom）门的下滑动画状态（落点 = box2 顶部对齐浏览器顶部） ===== */
    let autoScroll = false;            // 程序化滚动进行中
    let autoStart = 0, autoFrom = 0;   // 起始时间戳 / 起始位置
    let autoTo = 0;                    // 本次要滑到的目标滚动位置（点击时计算）
    let prevScrollBehavior = '';       // 用于临时关闭/恢复 CSS 的 scroll-behavior

    function easeInOutCubic(t) {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    function layout() {
        const vw = document.documentElement.clientWidth;
        const vh = document.documentElement.clientHeight;
        const zoom = window.devicePixelRatio / baseDpr;

        s = Math.floor(Math.min(vw / W, vh / H) * INIT * zoom * 1000) / 1000;
        left = Math.max(0, (vw - W * s) / 2);
        top1 = 0;                            // box1 顶部始终贴住浏览器顶部（任意缩放都无间距）
        top2 = top1 + H * s;                 // box2 顶部始终贴住 box1 底部（任意缩放都无间距）

        // fixed 元素不占文档高度，用 body 高度撑出可滚动范围
        document.body.style.height = (box2 ? top2 + H * s : vh + 1) + 'px';

        box1.style.visibility = 'visible';
        if (box2) box2.style.visibility = 'visible';
        snap();
    }

    function render(y) {
        const vh = document.documentElement.clientHeight;

        // box1：向上移动 y * SPEED1（慢于滚动）
        box1.style.transform =
            'translate3d(' + left + 'px,' + (top1 - y * SPEED1) + 'px,0) scale(' + s + ')';

        if (box2) {
            // box2：以正常速度从下方上来
            box2.style.transform =
                'translate3d(' + left + 'px,' + (top2 - y) + 'px,0) scale(' + s + ')';

            // box2 内部各层的视差
            const p = y + vh - top2;
            layers.forEach(function (el) {
                const k = parseFloat(el.dataset.speed) || 0;
                el.style.transform = 'translate3d(0,' + (p * k / s) + 'px,0)';
            });
        }
    }

    function loop(now) {
        if (autoScroll) return;             // 程序化滚动接管期间，不再跑普通缓动
        const target = window.scrollY;

        // 帧率无关缓动：以 60fps 为基准换算，保证高刷屏同样顺滑
        const dt = last ? Math.min(now - last, 100) : (1000 / 60); // 限制掉帧/切后台后的突跳
        last = now;
        const k = 1 - Math.pow(1 - EASE, dt / (1000 / 60));
        current += (target - current) * k;

        // 相对停止阈值：剩余距离小于“本次移动量”的 2%（至少 0.5px），
        // 这样无论一次滚动多少像素，都能在约 SMOOTH 秒内平滑收敛，不会拖尾
        const threshold = Math.max(0.5, gap * 0.02);
        if (Math.abs(target - current) < threshold) {
            current = target;
            last = 0;
            running = false;
        } else {
            requestAnimationFrame(loop);
        }
        render(current);
    }

    function kick() {
        if (autoScroll) return;             // 程序化滚动期间，忽略由它自身触发的手动滚动逻辑
        const t = window.scrollY;
        if (!running) {
            running = true;
            last = 0;
            refFrom = current;                 // 从当前动画位置开始计量
            gap = Math.abs(t - current);       // 本次要移动的总距离
            requestAnimationFrame(loop);
        } else {
            // 动画进行中又来新滚动：累计总距离，保证停止阈值始终合理
            gap = Math.max(gap, Math.abs(t - refFrom));
        }
    }

    function snap() {
        current = window.scrollY;
        render(current);
    }

    /* ===== 程序化滚动：下滑到 box2 顶部贴住浏览器顶部，时长 AUTO_MS，ease 缓动 ===== */
    function maxScrollY() {
        return Math.max(0,
            document.documentElement.scrollHeight - document.documentElement.clientHeight);
    }
    // 想确认本页最多能滑多远（≈一屏高），取消下一行注释看控制台即可
    // console.log('maxScrollY =', maxScrollY());

    // 目标落点：box2 在视口中的位置 = top2 - 2 * 滚动值（它是绝对定位，同时又被 -滚动值 平移）
    // 令该式为 0（box2 顶部贴住浏览器顶部）→ 滚动值 = top2 / 2，随缩放自适应
    function autoTargetY() {
        return top2 / 2;
    }

    function autoLoop(now) {
        const t = Math.min(1, (now - autoStart) / AUTO_MS);
        // 逐帧写入真实滚动位置，同时把同一数值交给 render，保证滚动条与视差完全同步
        current = Math.min(autoFrom + easeInOutCubic(t) * (autoTo - autoFrom), maxScrollY());
        window.scrollTo(0, current);        // 期间 CSS scroll-behavior 已临时置为 auto，故为瞬时定位
        render(current);

        if (t < 1) {
            requestAnimationFrame(autoLoop);
        } else {
            // 收尾：停在精确落点，并把控制权交还给普通缓动
            autoScroll = false;
            running = false;
            last = 0;
            document.documentElement.style.scrollBehavior = prevScrollBehavior;
            document.body.style.scrollBehavior = prevScrollBehavior;
            render(current);
        }
    }

    function startAutoScroll() {
        if (autoScroll) return;             // 动画进行中，忽略重复点击
        autoScroll = true;
        running = false;                    // 停掉普通缓动循环
        last = 0;
        // 临时关闭 CSS 的 scroll-behavior:smooth，否则每帧 scrollTo 会被浏览器再次平滑化导致抖动
        prevScrollBehavior = document.documentElement.style.scrollBehavior;
        document.documentElement.style.scrollBehavior = 'auto';
        document.body.style.scrollBehavior = 'auto';
        autoFrom = current;                 // 从当前动画位置起步，衔接顺滑
        autoTo = autoTargetY();             // 落点：box2 顶部与浏览器顶部距离为 0
        autoStart = performance.now();
        requestAnimationFrame(autoLoop);
    }

    function stopAutoScroll() {
        if (!autoScroll) return;
        autoScroll = false;
        running = false;
        last = 0;
        document.documentElement.style.scrollBehavior = prevScrollBehavior;
        document.body.style.scrollBehavior = prevScrollBehavior;
    }

    addEventListener('scroll', kick, { passive: true });
    addEventListener('resize', layout);   // Ctrl+滚轮缩放也会触发
    addEventListener('load', layout);

    /* 点击 YourRoom 门（#ID）：向下 ease 滑动 1800px */
    const idDoor = document.getElementById('ID');
    if (idDoor) {
        idDoor.addEventListener('click', function (e) {
            e.preventDefault();
            startAutoScroll();
        });
    }

    /* 动画期间用户一滚轮就立刻打断，交回手动滚动接管 */
    addEventListener('wheel', stopAutoScroll, { passive: true });
    addEventListener('touchstart', stopAutoScroll, { passive: true });

    /* ===== 前三扇门：点击弹窗（内容在 MODALS 里修改） ===== */
    const MODALS = {
        trunk: {
            title: '日常日记',
            jp: 'トランクルーム / TrunkRoom',
            icon: './ui/ico_nezumi.png',
            body: '到此为止了。',
            enter: '—— 敲门看看'
        },
        aqua: {
            title: '项目展示',
            jp: 'アクアリウム / AQUARIUM',
            icon: './ui/ico_sakana.png',
            body: '没有更多呢。',
            enter: '—— 贴近玻璃'
        },
        cons: {
            title: '联系方式',
            jp: 'コンソレーション / Consolation',
            icon: './ui/ico_acrsai.png',
            body: '<p>QQ:565775959<br>微信：cu1156577</p>',
            enter: '—— 在床边坐下'
        }
    };
    const modal = document.getElementById('modal');
    const modalBackdrop = document.getElementById('modalBackdrop');
    const modalTitle = document.getElementById('modalTitle');
    const modalJp = document.getElementById('modalJp');
    const modalResident = document.getElementById('modalResident');
    const modalBody = document.getElementById('modalBody');
    const modalEnter = document.getElementById('modalEnter');

    function openModal(key) {
        const m = MODALS[key];
        if (!m) return;
        modalTitle.textContent = m.title;
        modalJp.textContent = m.jp || '';
        modalEnter.textContent = m.enter || '';
        if (m.icon) {
            modalResident.src = m.icon;
            modalResident.alt = m.title + ' 的住客';
            modalResident.hidden = false;
        } else {
            modalResident.removeAttribute('src');
            modalResident.alt = '';
            modalResident.hidden = true;
        }
        modalBody.innerHTML = m.body;   // 支持 HTML 标签
        modal.classList.add('open');
        modal.setAttribute('aria-hidden', 'false');
    }
    function closeModal() {
        modal.classList.remove('open');
        modal.setAttribute('aria-hidden', 'true');
    }

    document.querySelectorAll('.door[data-modal]').forEach(function (a) {
        a.addEventListener('click', function (e) {
            e.preventDefault();               // 不再跳转页面
            openModal(a.dataset.modal);
        });
    });
    document.getElementById('modalClose').addEventListener('click', closeModal);
    modalBackdrop.addEventListener('click', closeModal);   // 点遮罩关闭
    addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });
    // 弹窗打开时，禁止滚轮带动背后页面滚动（卡片内部仍可滚动）
    modal.addEventListener('wheel', function (e) {
        if (e.target.closest('.modal__card')) return;
        e.preventDefault();
    }, { passive: false });

    /* ===== 点击头像放大 ===== */
    const avatar = document.getElementById('avatar');
    const lightbox = document.getElementById('lightbox');
    const lightboxBackdrop = document.getElementById('lightboxBackdrop');
    const lightboxImg = document.getElementById('lightboxImg');

    function openLightbox() {
        lightboxImg.src = avatar.src;
        lightboxImg.alt = avatar.alt || '头像';
        lightbox.classList.add('open');
        lightbox.setAttribute('aria-hidden', 'false');
    }
    function closeLightbox() {
        lightbox.classList.remove('open');
        lightbox.setAttribute('aria-hidden', 'true');
    }

    if (avatar && lightbox) {
        avatar.addEventListener('click', openLightbox);
        lightboxBackdrop.addEventListener('click', closeLightbox);
        lightboxImg.addEventListener('click', closeLightbox);
        addEventListener('keydown', function (e) {
            if (e.key === 'Escape') closeLightbox();
        });
        // 放大期间禁止滚轮带动背后页面
        lightbox.addEventListener('wheel', function (e) { e.preventDefault(); }, { passive: false });
    }

    /* ===== 粉色背景：全屏随机缓慢漂移的白色点状星光 ===== */
    const starsCanvas = document.getElementById('stars');
    if (starsCanvas) {
        const sctx = starsCanvas.getContext('2d');
        const sdpr = Math.min(window.devicePixelRatio || 1, 2);
        const STAR_COUNT = 40;                 // 星点数量
        let starParticles = [];
        let scw = 0, sch = 0;

        // 粒子禁入区：网页正中 1/2 部分（宽、高各取中间一半）
        function insideCenter(x, y) {
            return x > scw * 0.25 && x < scw * 0.75 && y > sch * 0.25 && y < sch * 0.75;
        }

        function makeStar() {
            let x, y;
            do {                                    // 只在外圈区域生成
                x = Math.random() * scw;
                y = Math.random() * sch;
            } while (insideCenter(x, y));
            return {
                x: x,
                y: y,
                r: Math.random() * 8 + 3,                // 点半径
                vx: (Math.random() - .5) * 0.25,           // 缓慢随机漂移
                vy: (Math.random() - .5) * 0.25,
                tw: Math.random() * Math.PI * 2,           // 闪烁相位
                twSpeed: Math.random() * 0.03 + 0.01       // 闪烁快慢
            };
        }

        function resizeStars() {
            scw = innerWidth; sch = innerHeight;
            starsCanvas.width = scw * sdpr;
            starsCanvas.height = sch * sdpr;
            sctx.setTransform(sdpr, 0, 0, sdpr, 0, 0);
            starParticles = [];
            for (let i = 0; i < STAR_COUNT; i++) starParticles.push(makeStar());
        }
        addEventListener('resize', resizeStars);
        resizeStars();

        (function starLoop() {
            sctx.clearRect(0, 0, scw, sch);
            for (const p of starParticles) {
                const prevX = p.x, prevY = p.y;
                p.x += p.vx; p.y += p.vy;
                if (p.x < -12) p.x = scw + 12; else if (p.x > scw + 12) p.x = -12;   // 出界从另一侧回来（含模糊余量）
                if (p.y < -12) p.y = sch + 12; else if (p.y > sch + 12) p.y = -12;
                // 漂进正中 1/2 禁入区则退回并按进入方向反弹
                if (insideCenter(p.x, p.y)) {
                    if (prevX <= scw * 0.25 || prevX >= scw * 0.75) p.vx = -p.vx;
                    if (prevY <= sch * 0.25 || prevY >= sch * 0.75) p.vy = -p.vy;
                    p.x = prevX; p.y = prevY;
                }
                p.tw += p.twSpeed;
                sctx.globalAlpha = Math.max(0, 0.55 + 0.45 * Math.sin(p.tw));   // 明暗闪烁
                sctx.fillStyle = '#fff';
                sctx.beginPath();
                sctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                sctx.fill();
            }
            sctx.globalAlpha = 1;
            requestAnimationFrame(starLoop);
        })();
    }

    layout();
});
