const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// --- アラートを画面内表示に置き換える関数 ---
let messageTimeout;
function showMessage(text) {
    const msgBox = document.getElementById('custom-message');
    msgBox.innerText = text;
    msgBox.style.display = 'block';
    clearTimeout(messageTimeout);
    messageTimeout = setTimeout(() => {
        msgBox.style.display = 'none';
    }, 2500); // 2.5秒で消える
}

// --- 音声生成 (Web Audio API) ---
let audioCtx;
let isAudioEnabled = false;

function initAudio() {
    if (!isAudioEnabled) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        isAudioEnabled = true;
        startBGM(); // 音声有効化と同時にBGM開始
    }
}

// 効果音を鳴らす関数
function playSFX(type) {
    if (!isAudioEnabled || audioCtx.state === 'suspended') return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    const now = audioCtx.currentTime;
    
    if (type === 'jump') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(600, now + 0.1);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc.start(now); osc.stop(now + 0.1);
    } else if (type === 'hover') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.linearRampToValueAtTime(300, now + 0.05);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.05);
        osc.start(now); osc.stop(now + 0.05);
    } else if (type === 'inhale') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.linearRampToValueAtTime(1000, now + 0.1);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.1);
        osc.start(now); osc.stop(now + 0.1);
    } else if (type === 'spit') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(200, now + 0.15);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        osc.start(now); osc.stop(now + 0.15);
    } else if (type === 'damage') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.exponentialRampToValueAtTime(50, now + 0.3);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc.start(now); osc.stop(now + 0.3);
    }
}

// BGM再生（超シンプルな8ビット風メロディのループ）
function startBGM() {
    const melody = [261, 329, 392, 523, 392, 329]; // ド ミ ソ 高ド ソ ミ
    let noteIndex = 0;
    setInterval(() => {
        if (!isAudioEnabled || audioCtx.state === 'suspended') return;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        
        const now = audioCtx.currentTime;
        osc.frequency.setValueAtTime(melody[noteIndex], now);
        gain.gain.setValueAtTime(0.03, now); // 音量は小さめ
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        
        osc.start(now); osc.stop(now + 0.2);
        noteIndex = (noteIndex + 1) % melody.length;
    }, 250); // 0.25秒ごとに次の音
}

// スタート画面をクリックしたらゲーム開始（音声許可）
document.getElementById('start-screen').addEventListener('click', function() {
    initAudio();
    this.style.display = 'none'; // スタート画面を隠す
});

// --- キー入力処理 ---
const keys = { left: false, right: false, up: false, jump: false, action: false };
const prevKeys = { jump: false, up: false, action: false };

window.addEventListener('keydown', (e) => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = true;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = true;
    if (e.code === 'ArrowUp' || e.code === 'KeyW') { keys.up = true; keys.jump = true; }
    if (e.code === 'Space') keys.jump = true;
    if (e.code === 'KeyZ' || e.code === 'KeyK') keys.action = true; // 吸い込みキー
});

window.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = false;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = false;
    if (e.code === 'ArrowUp' || e.code === 'KeyW') { keys.up = false; keys.jump = false; }
    if (e.code === 'Space') keys.jump = false;
    if (e.code === 'KeyZ' || e.code === 'KeyK') keys.action = false;
});

// --- ゲーム状態管理 ---
let gameState = 'hub';
let camera = { x: 0, y: 0 };
let platforms = [];
let enemies = [];
let doors = [];
let goals = [];
let projectiles = []; // 吐き出した星型弾

// --- プレイヤーの設定 ---
const player = {
    x: 100, y: 300, w: 40, h: 40,
    vx: 0, vy: 0,
    speed: 5, jumpPower: 12, hoverPower: 6, gravity: 0.6,
    isGrounded: false, isHovering: false,
    facingRight: true,
    hp: 10, maxHp: 10, invincibleTimer: 0,
    // 吸い込み状態
    isSucking: false,
    isFull: false // 敵を頬張っているか
};

function createPlatform(x, y, w, h, type = 'solid', moveData = null) {
    platforms.push({ x, y, w, h, type, moveData, startX: x, startY: y, time: 0 });
}

function createEnemy(x, y, type = 'waddle_dee') {
    enemies.push({ x, y, w: 40, h: 40, type, vx: 2, vy: 0, startX: x, isBeingSucked: false });
}

function createDoor(x, y, target) {
    doors.push({ x, y, w: 60, h: 80, target });
}

function createGoal(x, y) {
    goals.push({ x, y, w: 60, h: 60 });
}

// --- ステージ構築 ---
function clearScene() {
    platforms = []; enemies = []; doors = []; goals = []; projectiles = [];
    player.vx = 0; player.vy = 0; player.isHovering = false; player.isFull = false; player.isSucking = false;
}

function loadMap() {
    clearScene(); gameState = 'hub';
    document.getElementById('stage-display').innerText = 'マップ（ハブ）';
    player.x = 200; player.y = 300;
    createPlatform(0, 500, 1500, 100, 'solid');
    createDoor(150, 420, 'stage1');
    createDoor(400, 420, 'stage2');
    createDoor(650, 420, 'stage3');
    showMessage("遊びたいステージのドアの前で 上(↑)キー！");
}

function loadStage1() {
    clearScene(); gameState = 'stage1';
    document.getElementById('stage-display').innerText = 'ステージ1 (チュートリアル)';
    player.x = 100; player.y = 300;
    createPlatform(50, 500, 400, 100, 'solid');
    createEnemy(300, 460, 'waddle_dee'); // ワドルディ
    createPlatform(550, 500, 300, 100, 'solid');
    createEnemy(600, 460, 'waddle_doo'); // ワドルドゥ（一つ目）
    createPlatform(650, 400, 100, 20, 'oneway');
    createPlatform(950, 500, 400, 100, 'solid');
    createGoal(1150, 440);
    showMessage("Zキーで敵を吸い込んで、もう一度Zキーで星を吐き出そう！");
}

function loadStage2() {
    clearScene(); gameState = 'stage2';
    document.getElementById('stage-display').innerText = 'ステージ2 (大空の散歩)';
    player.x = 100; player.y = 300;
    createPlatform(50, 500, 200, 100, 'solid');
    createPlatform(400, 400, 150, 20, 'solid');
    createPlatform(700, 250, 150, 20, 'solid');
    createEnemy(750, 210, 'waddle_dee');
    createPlatform(1000, 100, 150, 20, 'solid');
    createPlatform(1300, 100, 200, 100, 'solid');
    createGoal(1400, 40);
}

function loadStage3() {
    clearScene(); gameState = 'stage3';
    document.getElementById('stage-display').innerText = 'ステージ3 (敵の群れ)';
    player.x = 100; player.y = 300;
    createPlatform(50, 500, 1500, 100, 'solid');
    createEnemy(400, 460, 'waddle_dee');
    createEnemy(600, 460, 'waddle_doo');
    createEnemy(800, 460, 'waddle_dee');
    createPlatform(1200, 400, 200, 100, 'solid');
    createGoal(1300, 340);
}

function takeDamage() {
    if (player.invincibleTimer <= 0) {
        player.hp -= 1;
        document.getElementById('hp-display').innerText = player.hp;
        player.invincibleTimer = 60;
        player.vy = -8; 
        player.isFull = false; // ダメージを受けると頬張ったものを落とす
        playSFX('damage');

        if (player.hp <= 0) {
            showMessage("ゲームオーバー！マップに戻ります。");
            player.hp = player.maxHp;
            document.getElementById('hp-display').innerText = player.hp;
            loadMap();
        }
    }
}

// 当たり判定ユーティリティ
function checkCollision(r1, r2) {
    return r1.x < r2.x + r2.w && r1.x + r1.w > r2.x &&
           r1.y < r2.y + r2.h && r1.y + r1.h > r2.y;
}

// --- 物理演算と更新 ---
function update() {
    if (player.invincibleTimer > 0) player.invincibleTimer--;

    // 吸い込み / 吐き出しの処理
    if (keys.action && !player.isFull && !player.isHovering) {
        player.isSucking = true;
        player.vx = 0; // 吸い込み中は動けない
        if (Math.random() < 0.2) playSFX('inhale'); // シュゴォォという音の代わり
    } else {
        player.isSucking = false;
        
        // 吐き出し（Zキーを押し直した時）
        if (keys.action && !prevKeys.action && player.isFull) {
            player.isFull = false;
            playSFX('spit');
            // 星型弾を生成
            projectiles.push({
                x: player.facingRight ? player.x + player.w : player.x - 40,
                y: player.y,
                w: 40, h: 40,
                vx: player.facingRight ? 15 : -15, // 高速で飛ぶ
                life: 60 // 60フレームで消える
            });
        }

        // 通常の左右移動
        if (keys.left) { player.vx = -player.speed; player.facingRight = false; }
        else if (keys.right) { player.vx = player.speed; player.facingRight = true; }
        else { player.vx = 0; }
    }

    // ホバリングを解除して吐き出す（空気を抜く）
    if (keys.action && !prevKeys.action && player.isHovering) {
        player.isHovering = false;
        playSFX('spit');
        // 空気弾（星より小さくてすぐ消える）
        projectiles.push({
            x: player.facingRight ? player.x + player.w : player.x - 20,
            y: player.y + 10, w: 20, h: 20,
            vx: player.facingRight ? 8 : -8, life: 15, isAir: true
        });
    }

    // ジャンプ＆ホバリング
    if (keys.jump && !prevKeys.jump && !player.isSucking) {
        if (player.isGrounded) {
            player.vy = -player.jumpPower;
            player.isGrounded = false;
            playSFX('jump');
        } else {
            // 空中ホバリング
            player.isHovering = true;
            player.vy = -player.hoverPower;
            playSFX('hover');
        }
    }
    
    if (player.isGrounded) player.isHovering = false;

    if (player.isHovering && player.vy > 0) {
        player.vy += player.gravity * 0.5; // 落下をふんわりさせる
    } else {
        player.vy += player.gravity;
    }

    // プレイヤーの座標更新と地形判定（X軸）
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

    // プレイヤーの座標更新と地形判定（Y軸）
    player.y += player.vy;
    player.isGrounded = false;
    platforms.forEach(p => {
        if (checkCollision(player, p)) {
            if (p.type === 'damage') takeDamage();
            else if (p.type === 'oneway') {
                if (player.vy > 0 && player.y - player.vy + player.h <= p.y + 10) {
                    player.y = p.y - player.h; player.vy = 0; player.isGrounded = true;
                }
            } else {
                if (player.vy > 0) {
                    player.y = p.y - player.h; player.vy = 0; player.isGrounded = true;
                } else if (player.vy < 0) {
                    player.y = p.y + p.h; player.vy = 0;
                }
            }
        }
    });

    // --- 星型弾（吐き出し）の更新 ---
    for (let i = projectiles.length - 1; i >= 0; i--) {
        let proj = projectiles[i];
        proj.x += proj.vx;
        proj.life--;
        if (proj.life <= 0) projectiles.splice(i, 1);
    }

    // --- 敵の更新 ---
    for (let i = enemies.length - 1; i >= 0; i--) {
        let e = enemies[i];

        // プレイヤーが吸い込み中の場合、吸い込み範囲にいるか判定
        if (player.isSucking && !e.isBeingSucked) {
            let suckRange = 150;
            let dist = Math.abs(e.x - player.x);
            // プレイヤーが向いている方向に敵がいて、範囲内かつ高さが近ければ
            if (dist < suckRange && Math.abs(e.y - player.y) < 50) {
                if ((player.facingRight && e.x > player.x) || (!player.facingRight && e.x < player.x)) {
                    e.isBeingSucked = true; // 吸い込まれ状態に移行
                }
            }
        }

        if (e.isBeingSucked) {
            // プレイヤーの口元に引き寄せられる
            let targetX = player.x + (player.facingRight ? player.w : -e.w);
            let targetY = player.y;
            e.x += (targetX - e.x) * 0.2;
            e.y += (targetY - e.y) * 0.2;

            // 口元に到達したら消滅してプレイヤーを「頬張り状態(Full)」にする
            if (Math.abs(e.x - targetX) < 10 && Math.abs(e.y - targetY) < 10) {
                player.isFull = true;
                player.isSucking = false;
                enemies.splice(i, 1);
                continue;
            }
            
            // 吸い込みをやめたら落下し直す
            if (!player.isSucking) e.isBeingSucked = false;

        } else {
            // 通常の動き
            e.vy += player.gravity;
            e.x += e.vx;
            let eGrounded = false;
            platforms.forEach(p => {
                if (p.type !== 'oneway' && checkCollision({x:e.x, y:e.y+e.vy, w:e.w, h:e.h}, p)) {
                    if (e.vy > 0) { e.y = p.y - e.h; e.vy = 0; eGrounded = true; }
                }
            });
            e.y += e.vy;

            if (Math.abs(e.x - e.startX) > 100) e.vx *= -1;

            // 星型弾との衝突判定
            for (let j = projectiles.length - 1; j >= 0; j--) {
                if (checkCollision(e, projectiles[j])) {
                    enemies.splice(i, 1); // 敵を倒す
                    if (!projectiles[j].isAir) projectiles.splice(j, 1); // 空気弾じゃなければ弾も消える
                    break;
                }
            }

            // プレイヤーとの衝突判定
            if (enemies[i] && checkCollision(player, e)) {
                if (player.vy > 0 && player.y + player.h - player.vy <= e.y + 10 && !player.isHovering) {
                    enemies.splice(i, 1); // 踏んで倒す
                    player.vy = -player.jumpPower * 0.8; 
                } else {
                    takeDamage();
                }
            }
        }
    }

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
                }
            }
        });
    } else {
        goals.forEach(g => {
            if (checkCollision(player, g)) {
                showMessage("ステージクリア！マップに戻ります。");
                player.hp = player.maxHp;
                document.getElementById('hp-display').innerText = player.hp;
                loadMap();
            }
        });
    }

    if (player.y > 1000) {
        takeDamage();
        if (player.hp > 0) { player.x = 100; player.y = 300; player.vy = 0; }
    }

    camera.x += (player.x - canvas.width / 2 - camera.x) * 0.1;
    camera.y += (player.y - canvas.height / 2 - camera.y) * 0.1;

    prevKeys.jump = keys.jump;
    prevKeys.up = keys.up;
    prevKeys.action = keys.action;
}

// --- 描画処理（Canvasでキャラを描画） ---
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(-camera.x, -camera.y);

    // 床の描画
    platforms.forEach(p => {
        if (p.type === 'solid') ctx.fillStyle = '#8BC34A';
        if (p.type === 'moving') ctx.fillStyle = '#9C27B0';
        if (p.type === 'oneway') ctx.fillStyle = '#FF9800';
        if (p.type === 'damage') ctx.fillStyle = '#F44336';
        ctx.fillRect(p.x, p.y, p.w, p.h);
        ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.strokeRect(p.x, p.y, p.w, p.h);
    });

    doors.forEach(d => {
        ctx.fillStyle = '#795548'; ctx.fillRect(d.x, d.y, d.w, d.h);
        ctx.fillStyle = '#FFEB3B'; ctx.beginPath(); ctx.arc(d.x + d.w/2, d.y + d.h/2, 10, 0, Math.PI*2); ctx.fill();
    });

    goals.forEach(g => {
        ctx.fillStyle = '#FFD700'; ctx.beginPath();
        ctx.arc(g.x + g.w/2, g.y + g.h/2 + Math.sin(Date.now() / 200) * 5, 25, 0, Math.PI*2); ctx.fill();
    });

    // 吐き出した星型弾の描画
    projectiles.forEach(proj => {
        if (proj.isAir) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.beginPath(); ctx.arc(proj.x + proj.w/2, proj.y + proj.h/2, proj.w/2, 0, Math.PI*2); ctx.fill();
        } else {
            ctx.fillStyle = '#FFEB3B'; // 星（黄色い丸で代用）
            ctx.beginPath(); ctx.arc(proj.x + proj.w/2, proj.y + proj.h/2, proj.w/2, 0, Math.PI*2); ctx.fill();
            // スピード感を出すための残像
            ctx.fillStyle = 'rgba(255, 235, 59, 0.5)';
            ctx.beginPath(); ctx.arc(proj.x + proj.w/2 - proj.vx, proj.y + proj.h/2, proj.w/2, 0, Math.PI*2); ctx.fill();
        }
    });

    // 敵（ワドルディ＆ワドルドゥ）の描画
    enemies.forEach(e => {
        if (e.isBeingSucked) {
            // 吸い込まれ中はぐにゃっと伸びる表現
            ctx.fillStyle = '#FF5722';
            ctx.fillRect(e.x, e.y + 10, e.w, 20);
            return;
        }

        let cx = e.x + e.w/2; let cy = e.y + e.h/2;
        
        // 体（共通：オレンジ）
        ctx.fillStyle = '#FF5722';
        ctx.beginPath(); ctx.arc(cx, cy, 20, 0, Math.PI*2); ctx.fill();
        // 足（共通：茶色）
        ctx.fillStyle = '#8D6E63';
        ctx.beginPath(); ctx.ellipse(cx - 10, cy + 18, 8, 4, 0, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(cx + 10, cy + 18, 8, 4, 0, 0, Math.PI*2); ctx.fill();

        let faceDir = e.vx > 0 ? 1 : -1;

        if (e.type === 'waddle_dee') {
            // ワドルディの顔（肌色）
            ctx.fillStyle = '#FFE0B2';
            ctx.beginPath(); ctx.ellipse(cx + 4 * faceDir, cy, 14, 12, 0, 0, Math.PI*2); ctx.fill();
            // ワドルディの目
            ctx.fillStyle = 'black';
            ctx.beginPath(); ctx.ellipse(cx + (4 + 6) * faceDir, cy - 2, 2, 6, 0, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.ellipse(cx + (4 - 4) * faceDir, cy - 2, 2, 6, 0, 0, Math.PI*2); ctx.fill();
        } else if (e.type === 'waddle_doo') {
            // ワドルドゥの巨大な一つ目（白目＋青い瞳）
            ctx.fillStyle = 'white';
            ctx.beginPath(); ctx.arc(cx + 5 * faceDir, cy - 3, 12, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#2196F3';
            ctx.beginPath(); ctx.arc(cx + 8 * faceDir, cy - 3, 6, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = 'black';
            ctx.beginPath(); ctx.arc(cx + 9 * faceDir, cy - 3, 2, 0, Math.PI*2); ctx.fill();
            // 髪の毛（数本の線）
            ctx.strokeStyle = '#FFC107'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(cx, cy - 20); ctx.lineTo(cx - 5, cy - 25); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(cx+5, cy - 18); ctx.lineTo(cx + 5, cy - 26); ctx.stroke();
        }
    });

    // --- プレイヤー（カービィ風）の描画 ---
    if (player.invincibleTimer % 10 < 5) {
        let cx = player.x + player.w / 2;
        let cy = player.y + player.h / 2;
        // ホバリングか頬張り状態で膨らむ
        let radius = (player.isHovering || player.isFull) ? 26 : 20; 

        // 体（ピンク）
        ctx.fillStyle = '#F8BBD0'; // さらにカービィらしい淡いピンク
        ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI*2); ctx.fill();

        let faceDir = player.facingRight ? 1 : -1;

        // 吸い込みエフェクト（風の線）
        if (player.isSucking) {
            ctx.strokeStyle = 'rgba(255,255,255,0.8)';
            ctx.lineWidth = 2;
            for(let i=0; i<3; i++) {
                let windX = cx + (30 + Math.random() * 50) * faceDir;
                let windY = cy - 10 + Math.random() * 20;
                ctx.beginPath();
                ctx.moveTo(windX, windY);
                ctx.lineTo(windX + 20 * faceDir, windY);
                ctx.stroke();
            }
        }

        // ほっぺ（濃いピンク）
        ctx.fillStyle = '#E91E63';
        ctx.beginPath(); ctx.ellipse(cx + 12 * faceDir, cy + 5, 4, 2, 0, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(cx + 2 * faceDir, cy + 5, 4, 2, 0, 0, Math.PI*2); ctx.fill();

        // 目（少し縦長）
        ctx.fillStyle = 'black';
        ctx.beginPath(); ctx.ellipse(cx + 8 * faceDir, cy - 2, 2, 7, 0, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(cx - 2 * faceDir, cy - 2, 2, 7, 0, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = 'white'; // ハイライト
        ctx.beginPath(); ctx.arc(cx + 8 * faceDir, cy - 6, 1.5, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx - 2 * faceDir, cy - 6, 1.5, 0, Math.PI*2); ctx.fill();

        // 口（状態によって変わる）
        ctx.fillStyle = '#D32F2F'; // 濃い赤
        if (player.isSucking) {
            // 吸い込み中：大きな口
            ctx.beginPath(); ctx.ellipse(cx + 12 * faceDir, cy + 2, 5, 8, 0, 0, Math.PI*2); ctx.fill();
        } else if (player.isFull || player.isHovering) {
            // 頬張り・ホバリング中：への字口（膨らんだ時のアレ）
            ctx.strokeStyle = 'black'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(cx + 3 * faceDir, cy + 2); ctx.lineTo(cx + 8 * faceDir, cy + 4); ctx.lineTo(cx + 13 * faceDir, cy + 2); ctx.stroke();
        } else {
            // 通常時：にっこり
            ctx.beginPath(); ctx.arc(cx + 5 * faceDir, cy + 4, 3, 0, Math.PI); ctx.fill();
        }

        // 手（ピンク、少し外側に）
        ctx.fillStyle = '#F48FB1';
        let handOffset = player.isSucking ? -5 : 0; // 吸い込み中は手を前に出す
        ctx.beginPath(); ctx.arc(cx + (18 + handOffset) * faceDir, cy + 2, 6, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx - 18 * faceDir, cy + 2, 6, 0, Math.PI*2); ctx.fill();

        // 足（赤）
        ctx.fillStyle = '#F44336';
        ctx.beginPath(); ctx.ellipse(cx - 8, cy + radius - 2, 10, 5, 0, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(cx + 8 + (player.vx === 0 ? 0 : 5*faceDir), cy + radius - 2, 10, 5, 0, 0, Math.PI*2); ctx.fill(); // 歩行で少し足が動く
    }

    ctx.restore();
}

// --- メインループ ---
function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

// セーブ・ロード機能（alertを使わずカスタムメッセージ表示）
document.getElementById('save-btn').addEventListener('click', () => {
    localStorage.setItem('2d_save', JSON.stringify({ state: gameState, x: player.x, y: player.y, hp: player.hp }));
    showMessage('セーブしました！');
});

document.getElementById('load-btn').addEventListener('click', () => {
    const data = JSON.parse(localStorage.getItem('2d_save'));
    if (data) {
        if (data.state === 'hub') loadMap();
        else if (data.state === 'stage1') loadStage1();
        else if (data.state === 'stage2') loadStage2();
        else if (data.state === 'stage3') loadStage3();
        player.x = data.x; player.y = data.y;
        player.hp = data.hp; document.getElementById('hp-display').innerText = player.hp;
        showMessage('ロードしました！');
    } else {
        showMessage('セーブデータがありません。');
    }
});

// ゲーム開始準備（マップ読み込み）
loadMap();
gameLoop();