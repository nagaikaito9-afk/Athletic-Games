const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

// 画面サイズに合わせる
function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// --- キー入力処理 (WASD + 矢印対応) ---
const keys = { left: false, right: false, up: false, jump: false };
const prevKeys = { jump: false, up: false }; // 押しっぱなし判定用

window.addEventListener('keydown', (e) => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = true;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = true;
    if (e.code === 'ArrowUp' || e.code === 'KeyW') { keys.up = true; keys.jump = true; }
    if (e.code === 'Space') keys.jump = true;
});

window.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = false;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = false;
    if (e.code === 'ArrowUp' || e.code === 'KeyW') { keys.up = false; keys.jump = false; }
    if (e.code === 'Space') keys.jump = false;
});

// --- ゲーム状態管理 ---
let gameState = 'hub';
let camera = { x: 0, y: 0 };
let platforms = [];
let enemies = [];
let doors = [];
let goals = [];

// --- プレイヤーの設定 ---
const player = {
    x: 100, y: 100, w: 40, h: 40,
    vx: 0, vy: 0,
    speed: 5, jumpPower: 12, hoverPower: 6, gravity: 0.6,
    isGrounded: false, isHovering: false,
    facingRight: true,
    hp: 10, maxHp: 10, invincibleTimer: 0
};

// --- オブジェクト生成関数 ---
function createPlatform(x, y, w, h, type = 'solid', moveData = null) {
    platforms.push({ x, y, w, h, type, moveData, startX: x, startY: y, time: 0 });
}

function createEnemy(x, y, type = 'walker') {
    enemies.push({ x, y, w: 40, h: 40, type, vx: 2, vy: 0, startX: x });
}

function createDoor(x, y, target) {
    doors.push({ x, y, w: 60, h: 80, target });
}

function createGoal(x, y) {
    goals.push({ x, y, w: 60, h: 60 });
}

// --- ステージ構築 ---
function clearScene() {
    platforms = []; enemies = []; doors = []; goals = [];
    player.vx = 0; player.vy = 0; player.isHovering = false;
}

// マップ（5つのドア）
function loadMap() {
    clearScene(); gameState = 'hub';
    document.getElementById('stage-display').innerText = 'マップ（ハブ）';
    player.x = 200; player.y = 300;

    createPlatform(0, 500, 1500, 100, 'solid');
    createDoor(150, 420, 'stage1'); // チュートリアル
    createDoor(400, 420, 'stage2'); // ホバリングの練習
    createDoor(650, 420, 'stage3'); // 動く床
    createDoor(900, 420, 'stage4'); // 敵だらけ
    createDoor(1150, 420, 'stage5'); // 総合テスト
}

function loadStage1() {
    clearScene(); gameState = 'stage1';
    document.getElementById('stage-display').innerText = 'ステージ1 (チュートリアル)';
    player.x = 100; player.y = 300;

    createPlatform(50, 500, 400, 100, 'solid');
    createEnemy(300, 460, 'walker');
    createPlatform(550, 500, 300, 100, 'solid');
    createPlatform(650, 400, 100, 20, 'oneway');
    createPlatform(950, 500, 400, 100, 'solid');
    createGoal(1150, 440);
}

function loadStage2() {
    clearScene(); gameState = 'stage2';
    document.getElementById('stage-display').innerText = 'ステージ2 (大空の散歩)';
    player.x = 100; player.y = 300;

    createPlatform(50, 500, 200, 100, 'solid');
    createPlatform(400, 400, 150, 20, 'solid');
    createPlatform(700, 250, 150, 20, 'solid');
    createPlatform(1000, 100, 150, 20, 'solid');
    createPlatform(1300, 100, 200, 100, 'solid');
    createGoal(1400, 40);
}

function loadStage3() {
    clearScene(); gameState = 'stage3';
    document.getElementById('stage-display').innerText = 'ステージ3 (アスレチック)';
    player.x = 100; player.y = 300;

    createPlatform(50, 500, 200, 100, 'solid');
    createPlatform(300, 500, 150, 20, 'moving', { speedX: 2, rangeX: 100, speedY: 0, rangeY: 0 });
    createPlatform(650, 400, 150, 20, 'moving', { speedX: 0, rangeX: 0, speedY: 2, rangeY: 100 });
    createPlatform(950, 200, 300, 100, 'solid');
    createEnemy(1050, 160, 'walker');
    createGoal(1150, 140);
}

function loadStage4() {
    clearScene(); gameState = 'stage4';
    document.getElementById('stage-display').innerText = 'ステージ4 (敵の群れ)';
    player.x = 100; player.y = 300;

    createPlatform(50, 500, 1500, 100, 'solid');
    createEnemy(400, 460, 'walker');
    createEnemy(600, 460, 'jumper');
    createEnemy(800, 460, 'walker');
    createEnemy(1000, 460, 'jumper');
    createPlatform(1200, 400, 200, 100, 'solid');
    createGoal(1300, 340);
}

function loadStage5() {
    clearScene(); gameState = 'stage5';
    document.getElementById('stage-display').innerText = 'ステージ5 (マスターへの道)';
    player.x = 100; player.y = 300;

    createPlatform(50, 500, 200, 100, 'solid');
    createPlatform(300, 600, 800, 50, 'damage'); // 下に落ちるとダメージ
    createPlatform(350, 400, 100, 20, 'moving', { speedX: 3, rangeX: 80, speedY: 0, rangeY: 0 });
    createEnemy(350, 360, 'jumper'); // 動く床に乗る敵
    createPlatform(600, 250, 100, 20, 'moving', { speedX: 0, rangeX: 0, speedY: 3, rangeY: 100 });
    createPlatform(850, 150, 100, 20, 'oneway');
    createPlatform(1100, 200, 300, 100, 'solid');
    createGoal(1250, 140);
}

// --- ダメージ処理 ---
function takeDamage() {
    if (player.invincibleTimer <= 0) {
        player.hp -= 1;
        document.getElementById('hp-display').innerText = player.hp;
        player.invincibleTimer = 60; // 60フレーム無敵
        player.vy = -8; // 大きくノックバック

        if (player.hp <= 0) {
            alert("ゲームオーバー！マップに戻ります。");
            player.hp = player.maxHp;
            document.getElementById('hp-display').innerText = player.hp;
            loadMap();
        }
    }
}

// --- 物理演算と更新 ---
function update() {
    // 無敵タイマー
    if (player.invincibleTimer > 0) player.invincibleTimer--;

    // 左右移動
    if (keys.left) { player.vx = -player.speed; player.facingRight = false; }
    else if (keys.right) { player.vx = player.speed; player.facingRight = true; }
    else { player.vx = 0; }

    // ジャンプ＆ホバリング（多段ジャンプ）
    if (keys.jump && !prevKeys.jump) {
        if (player.isGrounded) {
            player.vy = -player.jumpPower;
            player.isGrounded = false;
        } else {
            // 空中にいるときはホバリング
            player.isHovering = true;
            player.vy = -player.hoverPower;
        }
    }
    
    // 地面にいるときはホバリング解除
    if (player.isGrounded) player.isHovering = false;

    // 重力（ホバリング中は落下速度が少し緩やかになる）
    if (player.isHovering && player.vy > 0) {
        player.vy += player.gravity * 0.5; 
    } else {
        player.vy += player.gravity;
    }

    // 動く床の更新とプレイヤーの追従
    let ridingPlatform = null;
    platforms.forEach(p => {
        if (p.type === 'moving') {
            p.time += 0.05;
            let oldX = p.x; let oldY = p.y;
            p.x = p.startX + Math.sin(p.time * p.moveData.speedX) * p.moveData.rangeX;
            p.y = p.startY + Math.sin(p.time * p.moveData.speedY) * p.moveData.rangeY;
            
            // 床に乗っている場合、一緒に動かす
            if (player.isGrounded && player.y + player.h === oldY && player.x + player.w > oldX && player.x < oldX + p.w) {
                player.x += (p.x - oldX);
                player.y += (p.y - oldY);
                ridingPlatform = p;
            }
        }
    });

    // --- 当たり判定（X軸） ---
    player.x += player.vx;
    platforms.forEach(p => {
        if (p.type === 'oneway') return;
        if (checkCollision(player, p)) {
            if (p.type === 'damage') takeDamage();
            else {
                if (player.vx > 0) player.x = p.x - player.w;
                if (player.vx < 0) player.x = p.x + p.w;
            }
        }
    });

    // --- 当たり判定（Y軸） ---
    player.y += player.vy;
    player.isGrounded = false;
    
    platforms.forEach(p => {
        if (checkCollision(player, p)) {
            if (p.type === 'damage') takeDamage();
            else if (p.type === 'oneway') {
                if (player.vy > 0 && player.y - player.vy + player.h <= p.y + 10) {
                    player.y = p.y - player.h;
                    player.vy = 0;
                    player.isGrounded = true;
                }
            } else {
                if (player.vy > 0) { // 落下中
                    player.y = p.y - player.h;
                    player.vy = 0;
                    player.isGrounded = true;
                } else if (player.vy < 0) { // 上昇中（頭をぶつける）
                    player.y = p.y + p.h;
                    player.vy = 0;
                }
            }
        }
    });

    // --- 敵の更新 ---
    enemies.forEach(e => {
        e.vy += player.gravity; // 敵の重力
        e.x += e.vx;
        
        let eGrounded = false;
        platforms.forEach(p => {
            if (p.type !== 'oneway' && checkCollision({x:e.x, y:e.y+e.vy, w:e.w, h:e.h}, p)) {
                if (e.vy > 0) { e.y = p.y - e.h; e.vy = 0; eGrounded = true; }
            }
        });
        e.y += e.vy;

        // 簡易AI: 一定距離を歩いたら反転
        if (Math.abs(e.x - e.startX) > 100) e.vx *= -1;

        // ジャンパー敵
        if (e.type === 'jumper' && eGrounded && Math.random() < 0.02) e.vy = -10;

        // プレイヤーとの判定
        if (checkCollision(player, e)) {
            // 上から踏んだ
            if (player.vy > 0 && player.y + player.h - player.vy <= e.y + 10) {
                e.y = 9999; // 倒す（画面外へ）
                player.vy = -player.jumpPower * 0.8; // 踏みジャンプ
                player.isHovering = false;
            } else {
                takeDamage();
            }
        }
    });

    // --- ドアとゴール判定 ---
    const hintUI = document.getElementById('action-hint');
    hintUI.innerText = "";

    if (gameState === 'hub') {
        doors.forEach(d => {
            if (checkCollision(player, d)) {
                hintUI.innerText = "↑またはWキーで " + d.target + " へ";
                if (keys.up && !prevKeys.up) {
                    if (d.target === 'stage1') loadStage1();
                    if (d.target === 'stage2') loadStage2();
                    if (d.target === 'stage3') loadStage3();
                    if (d.target === 'stage4') loadStage4();
                    if (d.target === 'stage5') loadStage5();
                }
            }
        });
    } else {
        goals.forEach(g => {
            if (checkCollision(player, g)) {
                alert("ステージクリア！マップに戻ります。");
                player.hp = player.maxHp;
                document.getElementById('hp-display').innerText = player.hp;
                loadMap();
            }
        });
    }

    // 落下時の復帰
    if (player.y > 1000) {
        takeDamage();
        if (player.hp > 0) {
            player.x = 100; player.y = 300; player.vy = 0;
        }
    }

    // カメラの追従（プレイヤーを中心に）
    camera.x += (player.x - canvas.width / 2 - camera.x) * 0.1;
    camera.y += (player.y - canvas.height / 2 - camera.y) * 0.1;

    // 前回のキー状態を保存
    prevKeys.jump = keys.jump;
    prevKeys.up = keys.up;
}

// 矩形の当たり判定ユーティリティ
function checkCollision(r1, r2) {
    return r1.x < r2.x + r2.w && r1.x + r1.w > r2.x &&
           r1.y < r2.y + r2.h && r1.y + r1.h > r2.y;
}

// --- 描画処理（画像なしでかわいく描画） ---
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    ctx.save();
    ctx.translate(-camera.x, -camera.y); // カメラ適用

    // 床の描画
    platforms.forEach(p => {
        if (p.type === 'solid') ctx.fillStyle = '#8BC34A'; // 緑
        if (p.type === 'moving') ctx.fillStyle = '#9C27B0'; // 紫
        if (p.type === 'oneway') ctx.fillStyle = '#FF9800'; // オレンジ
        if (p.type === 'damage') ctx.fillStyle = '#F44336'; // 赤（トゲ）
        
        ctx.fillRect(p.x, p.y, p.w, p.h);
        
        // 模様をつける
        ctx.strokeStyle = 'rgba(0,0,0,0.2)';
        ctx.strokeRect(p.x, p.y, p.w, p.h);
    });

    // ドアの描画（星マーク付き）
    doors.forEach(d => {
        ctx.fillStyle = '#795548'; // 茶色
        ctx.fillRect(d.x, d.y, d.w, d.h);
        ctx.fillStyle = '#FFEB3B'; // 星の色
        ctx.beginPath();
        ctx.arc(d.x + d.w/2, d.y + d.h/2, 10, 0, Math.PI*2);
        ctx.fill();
    });

    // ゴールの描画（大きな星）
    goals.forEach(g => {
        ctx.fillStyle = '#FFD700'; // 金色
        ctx.beginPath();
        ctx.arc(g.x + g.w/2, g.y + g.h/2 + Math.sin(Date.now() / 200) * 5, 25, 0, Math.PI*2);
        ctx.fill();
    });

    // 敵の描画（ワドルディ風）
    enemies.forEach(e => {
        ctx.fillStyle = e.type === 'walker' ? '#FF9800' : '#E91E63'; // オレンジか赤
        ctx.beginPath();
        ctx.arc(e.x + e.w/2, e.y + e.h/2, e.w/2, 0, Math.PI*2);
        ctx.fill();
        
        // 目
        ctx.fillStyle = 'black';
        let lookDir = e.vx > 0 ? 5 : -5;
        ctx.beginPath(); ctx.arc(e.x + 15 + lookDir, e.y + 15, 3, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(e.x + 25 + lookDir, e.y + 15, 3, 0, Math.PI*2); ctx.fill();
    });

    // --- プレイヤー（カービィ風）の描画 ---
    if (player.invincibleTimer % 10 < 5) { // 点滅
        let cx = player.x + player.w / 2;
        let cy = player.y + player.h / 2;
        let radius = player.isHovering ? 24 : 20; // ホバリング時はぷくっと膨らむ

        // 体（ピンク）
        ctx.fillStyle = '#F48FB1';
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI*2);
        ctx.fill();

        // ほっぺ（濃いピンク）
        ctx.fillStyle = '#E91E63';
        let faceDir = player.facingRight ? 1 : -1;
        ctx.beginPath(); ctx.ellipse(cx + 12 * faceDir, cy + 5, 4, 2, 0, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(cx + 2 * faceDir, cy + 5, 4, 2, 0, 0, Math.PI*2); ctx.fill();

        // 目（黒と白のハイライト）
        ctx.fillStyle = 'black';
        ctx.beginPath(); ctx.ellipse(cx + 8 * faceDir, cy - 2, 2, 6, 0, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(cx - 2 * faceDir, cy - 2, 2, 6, 0, 0, Math.PI*2); ctx.fill();
        
        ctx.fillStyle = 'white';
        ctx.beginPath(); ctx.arc(cx + 8 * faceDir, cy - 5, 1, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx - 2 * faceDir, cy - 5, 1, 0, Math.PI*2); ctx.fill();

        // 足（赤）
        ctx.fillStyle = '#F44336';
        ctx.beginPath(); ctx.ellipse(cx - 8, cy + radius - 2, 8, 4, 0, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(cx + 8, cy + radius - 2, 8, 4, 0, 0, Math.PI*2); ctx.fill();
    }

    ctx.restore();
}

// --- メインループ ---
function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

// セーブ・ロード機能
document.getElementById('save-btn').addEventListener('click', () => {
    localStorage.setItem('2d_save', JSON.stringify({ state: gameState, x: player.x, y: player.y, hp: player.hp }));
    alert('セーブしました！');
});

document.getElementById('load-btn').addEventListener('click', () => {
    const data = JSON.parse(localStorage.getItem('2d_save'));
    if (data) {
        if (data.state === 'hub') loadMap();
        else if (data.state === 'stage1') loadStage1();
        else if (data.state === 'stage2') loadStage2();
        else if (data.state === 'stage3') loadStage3();
        else if (data.state === 'stage4') loadStage4();
        else if (data.state === 'stage5') loadStage5();
        
        player.x = data.x; player.y = data.y;
        player.hp = data.hp; document.getElementById('hp-display').innerText = player.hp;
    }
});

// ゲーム開始
loadMap();
gameLoop();