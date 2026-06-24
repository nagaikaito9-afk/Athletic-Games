// --- 基本設定とリアルな描画設定 ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);
// 霧を追加して奥行きをリアルに
scene.fog = new THREE.FogExp2(0x87CEEB, 0.02);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true; // 影を有効化
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// ライト（影を作る）
const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(10, 20, 10);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
scene.add(dirLight);
scene.add(new THREE.AmbientLight(0xffffff, 0.5));

// --- ゲーム状態管理 ---
let gameState = 'hub'; // 'hub' または 'stage1' など
let hp = 10;
const maxHp = 10;
let invincibleTimer = 0;

// --- プレイヤーの作成（頭と体を持つ少しリアルな形） ---
const playerGroup = new THREE.Group();
const bodyGeo = new THREE.CylinderGeometry(0.4, 0.4, 1, 16);
const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2196F3, roughness: 0.3, metalness: 0.5 });
const body = new THREE.Mesh(bodyGeo, bodyMat);
body.castShadow = true;

const headGeo = new THREE.SphereGeometry(0.35, 16, 16);
const headMat = new THREE.MeshStandardMaterial({ color: 0xFFEB3B, roughness: 0.2 });
const head = new THREE.Mesh(headGeo, headMat);
head.position.y = 0.7;
head.castShadow = true;

playerGroup.add(body);
playerGroup.add(head);
scene.add(playerGroup);

let pVelocity = { x: 0, y: 0 };
const gravity = 0.015;
const jumpPower = 0.35;
const moveSpeed = 0.15;
let isGrounded = false;
let activeOverlaps = []; // ドアなどの判定用

// --- ステージ構成要素の配列 ---
let platforms = [];
let enemies = [];
let doors = [];
let goals = [];

// --- オブジェクト生成関数 ---
// type: 'solid'(完全固定), 'oneway'(下からすり抜け), 'damage'(トゲなど), 'moving'(動く床)
function createPlatform(x, y, w, h, type = 'solid', moveData = null) {
    let color = 0x8BC34A; // 基本の緑
    let roughness = 0.8;
    if (type === 'oneway') { color = 0xFF9800; roughness = 0.5; } // オレンジ
    if (type === 'damage') { color = 0xF44336; roughness = 0.2; } // 赤
    if (type === 'moving') { color = 0x9C27B0; } // 紫

    const geo = new THREE.BoxGeometry(w, h, 2);
    const mat = new THREE.MeshStandardMaterial({ color: color, roughness: roughness });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, 0);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);

    platforms.push({ mesh, x, y, w, h, type, moveData, startX: x, startY: y, time: 0 });
}

// 敵の生成 type: 'walker'(歩くだけ), 'jumper'(跳ねる)
function createEnemy(x, y, type = 'walker') {
    const geo = new THREE.SphereGeometry(0.5, 16, 16);
    const mat = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.1 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, 0);
    mesh.castShadow = true;
    scene.add(mesh);

    enemies.push({ mesh, x, y, w: 1, h: 1, type, vx: 0.05, vy: 0 });
}

function createDoor(x, y, targetStage) {
    const geo = new THREE.BoxGeometry(1.5, 2.5, 0.5);
    const mat = new THREE.MeshStandardMaterial({ color: 0x795548 }); // 茶色
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y + 0.75, -1); // 背景側に少し押し込む
    scene.add(mesh);
    doors.push({ mesh, x, y, w: 1.5, h: 2.5, target: targetStage });
}

function createGoal(x, y) {
    const geo = new THREE.TorusGeometry(0.8, 0.2, 16, 32);
    const mat = new THREE.MeshStandardMaterial({ color: 0xFFD700, emissive: 0x555500 }); // 輝く金
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y + 1, 0);
    scene.add(mesh);
    goals.push({ mesh, x, y, w: 1.6, h: 1.6 });
}

// --- ステージ切り替え ---
function clearScene() {
    [...platforms, ...enemies, ...doors, ...goals].forEach(obj => {
        scene.remove(obj.mesh);
    });
    platforms = []; enemies = []; doors = []; goals = [];
}

function loadMap() {
    clearScene();
    gameState = 'hub';
    document.getElementById('stage-display').innerText = 'マップ（ハブ）';
    playerGroup.position.set(0, 2, 0);
    pVelocity = { x: 0, y: 0 };

    createPlatform(0, 0, 20, 1, 'solid');
    createDoor(3, 0.5, 'stage1');
    // ステージが増えたら createDoor(8, 0.5, 'stage2'); などを追加
}

function loadStage1() {
    clearScene();
    gameState = 'stage1';
    document.getElementById('stage-display').innerText = 'ステージ1';
    playerGroup.position.set(0, 2, 0);
    pVelocity = { x: 0, y: 0 };

    // スタート地点
    createPlatform(0, 0, 6, 1, 'solid');
    // すり抜け床
    createPlatform(5, 3, 4, 0.5, 'oneway');
    // 動く床
    createPlatform(12, 3, 3, 0.5, 'moving', { speedX: 0.05, rangeX: 3, speedY: 0, rangeY: 0 });
    // ダメージ床
    createPlatform(18, 0, 4, 1, 'damage');
    createPlatform(18, -1.5, 10, 4, 'solid'); // ダメージ床の下の土台

    // 敵の配置
    createEnemy(5, 5, 'walker');
    createEnemy(15, 5, 'jumper');

    // ゴール
    createPlatform(25, 4, 4, 1, 'solid');
    createGoal(25, 4.5);
}

// ダメージ処理関数
function takeDamage() {
    if (invincibleTimer <= 0) {
        hp -= 1;
        document.getElementById('hp-display').innerText = hp;
        invincibleTimer = 60; // 60フレーム（約1秒）無敵
        pVelocity.y = 0.2; // ノックバックで少し浮く
        body.material.color.setHex(0xff0000); // 赤く点滅

        if (hp <= 0) {
            alert("ゲームオーバー！マップに戻ります。");
            hp = maxHp;
            document.getElementById('hp-display').innerText = hp;
            loadMap();
        }
    }
}

// --- 入力処理 ---
const keys = { left: false, right: false, jump: false, up: false };
window.addEventListener('keydown', (e) => {
    if (e.code === 'ArrowLeft') keys.left = true;
    if (e.code === 'ArrowRight') keys.right = true;
    if (e.code === 'Space') keys.jump = true;
    if (e.code === 'ArrowUp') keys.up = true;
});
window.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowLeft') keys.left = false;
    if (e.code === 'ArrowRight') keys.right = false;
    if (e.code === 'Space') keys.jump = false;
    if (e.code === 'ArrowUp') keys.up = false;
});

// セーブ・ロード
document.getElementById('save-btn').addEventListener('click', () => {
    localStorage.setItem('3d_save', JSON.stringify({ state: gameState, x: playerGroup.position.x, y: playerGroup.position.y, hp: hp }));
    alert('セーブしました！');
});
document.getElementById('load-btn').addEventListener('click', () => {
    const data = JSON.parse(localStorage.getItem('3d_save'));
    if (data) {
        if (data.state === 'hub') loadMap();
        else if (data.state === 'stage1') loadStage1();
        playerGroup.position.set(data.x, data.y, 0);
        hp = data.hp;
        document.getElementById('hp-display').innerText = hp;
    }
});

// --- メインループ ---
function animate() {
    requestAnimationFrame(animate);

    // 無敵時間の処理
    if (invincibleTimer > 0) {
        invincibleTimer--;
        playerGroup.visible = (invincibleTimer % 10 < 5); // 点滅
        if (invincibleTimer === 0) {
            playerGroup.visible = true;
            body.material.color.setHex(0x2196F3); // 元の色に戻す
        }
    }

    // 動く床の更新
    platforms.forEach(p => {
        if (p.type === 'moving' && p.moveData) {
            p.time += 0.05;
            p.x = p.startX + Math.sin(p.time * p.moveData.speedX * 20) * p.moveData.rangeX;
            p.mesh.position.x = p.x;
        }
    });

    // プレイヤーのX移動
    let prevX = playerGroup.position.x;
    if (keys.left) playerGroup.position.x -= moveSpeed;
    if (keys.right) playerGroup.position.x += moveSpeed;

    // AABB当たり判定関数（簡易版）
    const isOverlap = (px, py, pw, ph, ox, oy, ow, oh) => {
        return Math.abs(px - ox) < (pw + ow) / 2 && Math.abs(py - oy) < (ph + oh) / 2;
    };

    const pWidth = 0.8;
    const pHeight = 1.7; // 頭と体

    // ブロックとのX軸衝突判定
    platforms.forEach(p => {
        if (p.type === 'oneway') return; // すり抜け床はX軸判定しない
        if (isOverlap(playerGroup.position.x, playerGroup.position.y, pWidth, pHeight, p.x, p.y, p.w, p.h)) {
            if (p.type === 'damage') takeDamage();
            else playerGroup.position.x = prevX; // 壁にぶつかったら戻す
        }
    });

    // プレイヤーのY移動（ジャンプ・重力）
    let prevY = playerGroup.position.y;
    if (keys.jump && isGrounded) {
        pVelocity.y = jumpPower;
        isGrounded = false;
    }
    pVelocity.y -= gravity;
    playerGroup.position.y += pVelocity.y;

    isGrounded = false;
    
    // 乗っている動く床の慣性用
    let ridingPlatform = null;

    // ブロックとのY軸衝突判定
    platforms.forEach(p => {
        if (isOverlap(playerGroup.position.x, playerGroup.position.y, pWidth, pHeight, p.x, p.y, p.w, p.h)) {
            if (p.type === 'damage') {
                takeDamage();
            } else if (p.type === 'oneway') {
                // 上から落ちてきた時のみ乗れる
                if (pVelocity.y < 0 && prevY - pHeight/2 >= p.y + p.h/2 - 0.2) {
                    playerGroup.position.y = p.y + p.h/2 + pHeight/2;
                    pVelocity.y = 0;
                    isGrounded = true;
                }
            } else { // 通常・動く床
                if (pVelocity.y < 0) { // 落下中（床に乗る）
                    playerGroup.position.y = p.y + p.h/2 + pHeight/2;
                    pVelocity.y = 0;
                    isGrounded = true;
                    if (p.type === 'moving') ridingPlatform = p;
                } else if (pVelocity.y > 0) { // 上昇中（天井にぶつかる）
                    playerGroup.position.y = prevY;
                    pVelocity.y = 0;
                }
            }
        }
    });

    // 動く床に乗っている場合、一緒に移動させる
    if (ridingPlatform && ridingPlatform.type === 'moving') {
        const dx = ridingPlatform.x - ridingPlatform.mesh.position.x; // 1フレーム前の位置との差
        // 簡易的に直接速度を加算
        playerGroup.position.x += Math.cos(ridingPlatform.time * ridingPlatform.moveData.speedX * 20) * ridingPlatform.moveData.speedX * ridingPlatform.moveData.rangeX;
    }

    // 敵の更新と判定
    enemies.forEach(e => {
        // 動き
        e.vy -= gravity;
        e.x += e.vx;
        e.y += e.vy;

        // 敵と床の簡易判定
        let eGrounded = false;
        platforms.forEach(p => {
            if (p.type !== 'oneway' && isOverlap(e.x, e.y, e.w, e.h, p.x, p.y, p.w, p.h)) {
                if (e.vy < 0) {
                    e.y = p.y + p.h/2 + e.h/2;
                    e.vy = 0;
                    eGrounded = true;
                }
            }
        });

        // 足場から落ちそうなら反転、または壁にぶつかったら反転
        if (Math.abs(e.x - 5) > 5) e.vx *= -1; // 簡易的な反転範囲

        // 能力（jumper）
        if (e.type === 'jumper' && eGrounded && Math.random() < 0.02) {
            e.vy = 0.25;
        }

        e.mesh.position.set(e.x, e.y, 0);

        // プレイヤーと敵の判定
        if (isOverlap(playerGroup.position.x, playerGroup.position.y, pWidth, pHeight, e.x, e.y, e.w, e.h)) {
            // 上から踏んだか？
            if (pVelocity.y < 0 && prevY - pHeight/2 > e.y) {
                // 敵を倒す（画面外へ飛ばす）
                e.y = -100;
                pVelocity.y = jumpPower * 0.8; // 踏みジャンプ
            } else {
                takeDamage();
            }
        }
    });

    // ドアとゴールの判定（UIヒント）
    const hintUI = document.getElementById('action-hint');
    hintUI.innerText = "";
    
    if (gameState === 'hub') {
        doors.forEach(d => {
            if (isOverlap(playerGroup.position.x, playerGroup.position.y, pWidth, pHeight, d.x, d.y, d.w, d.h)) {
                hintUI.innerText = "↑キーでステージへ";
                if (keys.up) {
                    keys.up = false; // 連続入力を防ぐ
                    loadStage1();
                }
            }
        });
    } else {
        goals.forEach(g => {
            g.mesh.rotation.y += 0.05; // ゴールを回転させる
            if (isOverlap(playerGroup.position.x, playerGroup.position.y, pWidth, pHeight, g.x, g.y, g.w, g.h)) {
                alert("ステージクリア！マップに戻ります。");
                hp = maxHp;
                document.getElementById('hp-display').innerText = hp;
                loadMap();
            }
        });
    }

    // 落下判定（穴に落ちたらダメージを受けて初期位置へ）
    if (playerGroup.position.y < -10) {
        takeDamage();
        if (hp > 0) {
            playerGroup.position.set(0, 5, 0);
            pVelocity.y = 0;
        }
    }

    // カメラ追従
    camera.position.x += (playerGroup.position.x - camera.position.x) * 0.1; // 滑らかに追従
    camera.position.y += ((playerGroup.position.y + 3) - camera.position.y) * 0.1;
    camera.position.z = 12;
    camera.lookAt(camera.position.x, camera.position.y - 1, 0);

    // 高度の更新
    document.getElementById('height-display').innerText = Math.max(0, Math.floor(playerGroup.position.y)).toString();

    renderer.render(scene, camera);
}

// リサイズ対応
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// 初期化（マップから開始）
loadMap();
animate();