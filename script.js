// --- 基本設定とリアルな描画設定 ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);
scene.fog = new THREE.FogExp2(0x87CEEB, 0.02);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(10, 20, 10);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
scene.add(dirLight);
scene.add(new THREE.AmbientLight(0xffffff, 0.5));

// --- ゲーム状態管理 ---
let gameState = 'hub';
let hp = 10;
const maxHp = 10;
let invincibleTimer = 0;

// --- プレイヤーの作成 ---
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

// --- 物理演算用変数 ---
let pVelocity = { x: 0, y: 0 };
const gravity = 0.015;
const jumpPower = 0.36; // 確実にジャンプが届くよう微調整
const moveSpeed = 0.15;
let isGrounded = false;
let ridingPlatform = null; // ★追加：現在乗っている動く床を記憶

// --- ステージ構成要素 ---
let platforms = [];
let enemies = [];
let doors = [];
let goals = [];

// --- オブジェクト生成関数 ---
function createPlatform(x, y, w, h, type = 'solid', moveData = null) {
    let color = 0x8BC34A;
    let roughness = 0.8;
    if (type === 'oneway') { color = 0xFF9800; roughness = 0.5; }
    if (type === 'damage') { color = 0xF44336; roughness = 0.2; }
    if (type === 'moving') { color = 0x9C27B0; }

    const geo = new THREE.BoxGeometry(w, h, 2);
    const mat = new THREE.MeshStandardMaterial({ color: color, roughness: roughness });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, 0);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);

    platforms.push({ mesh, x, y, w, h, type, moveData, startX: x, startY: y, time: 0 });
}

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
    const mat = new THREE.MeshStandardMaterial({ color: 0x795548 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y + 0.75, -1);
    scene.add(mesh);
    doors.push({ mesh, x, y, w: 1.5, h: 2.5, target: targetStage });
}

function createGoal(x, y) {
    const geo = new THREE.TorusGeometry(0.8, 0.2, 16, 32);
    const mat = new THREE.MeshStandardMaterial({ color: 0xFFD700, emissive: 0x555500 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y + 1, 0);
    scene.add(mesh);
    goals.push({ mesh, x, y, w: 1.6, h: 1.6 });
}

// --- ステージ構築 ---
function clearScene() {
    [...platforms, ...enemies, ...doors, ...goals].forEach(obj => {
        scene.remove(obj.mesh);
    });
    platforms = []; enemies = []; doors = []; goals = [];
    ridingPlatform = null;
}

function loadMap() {
    clearScene();
    gameState = 'hub';
    document.getElementById('stage-display').innerText = 'マップ（ハブ）';
    playerGroup.position.set(0, 2, 0);
    pVelocity = { x: 0, y: 0 };

    createPlatform(5, 0, 30, 1, 'solid');
    // ステージを3つに増強
    createDoor(0, 0.5, 'stage1');
    createDoor(5, 0.5, 'stage2');
    createDoor(10, 0.5, 'stage3');
}

function loadStage1() {
    clearScene();
    gameState = 'stage1';
    document.getElementById('stage-display').innerText = 'ステージ1 (チュートリアル)';
    playerGroup.position.set(0, 2, 0);
    pVelocity = { x: 0, y: 0 };

    createPlatform(0, 0, 8, 1, 'solid'); // スタート
    createPlatform(10, 0, 6, 1, 'solid'); // 少し隙間
    createEnemy(10, 2, 'walker');
    createPlatform(15, 2, 2, 0.5, 'oneway'); // すり抜け階段
    createPlatform(18, 4, 2, 0.5, 'oneway');
    createPlatform(24, 0, 10, 1, 'damage'); // 下のダメージ床
    createPlatform(24, 4, 3, 0.5, 'moving', { speedX: 0.05, rangeX: 3, speedY: 0, rangeY: 0 }); // 確実に行ける動く床
    createPlatform(31, 4, 5, 1, 'solid'); // ゴール地点
    createGoal(32, 4.5);
}

function loadStage2() {
    clearScene();
    gameState = 'stage2';
    document.getElementById('stage-display').innerText = 'ステージ2 (縦の試練)';
    playerGroup.position.set(0, 2, 0);
    pVelocity = { x: 0, y: 0 };

    createPlatform(0, 0, 6, 1, 'solid');
    createPlatform(-2, 3, 3, 0.5, 'oneway');
    createPlatform(3, 6, 3, 0.5, 'oneway');
    createPlatform(-2, 9, 3, 0.5, 'oneway');
    // 縦に動くリフト
    createPlatform(4, 11, 3, 0.5, 'moving', { speedX: 0, rangeX: 0, speedY: 0.04, rangeY: 3 });
    createPlatform(10, 14, 6, 1, 'solid');
    createEnemy(10, 16, 'jumper');
    createGoal(11, 14.5);
}

function loadStage3() {
    clearScene();
    gameState = 'stage3';
    document.getElementById('stage-display').innerText = 'ステージ3 (アスレチックマスター)';
    playerGroup.position.set(0, 2, 0);
    pVelocity = { x: 0, y: 0 };

    createPlatform(0, 0, 4, 1, 'solid');
    createPlatform(6, 0, 3, 0.5, 'moving', { speedX: 0.05, rangeX: 3, speedY: 0, rangeY: 0 });
    createPlatform(13, 2, 4, 1, 'solid');
    createEnemy(13, 4, 'jumper');
    
    createPlatform(21, 0, 12, 1, 'damage'); // 長いダメージ床
    createPlatform(18, 4, 2, 0.5, 'oneway');
    createPlatform(21, 5, 2, 0.5, 'oneway');
    createPlatform(24, 6, 2, 0.5, 'oneway');
    
    // 縦横斜めに複雑に動く床
    createPlatform(28, 8, 3, 0.5, 'moving', { speedX: 0, rangeX: 0, speedY: 0.05, rangeY: 3 });
    createPlatform(34, 10, 5, 1, 'solid');
    createGoal(34, 10.5);
}

function takeDamage() {
    if (invincibleTimer <= 0) {
        hp -= 1;
        document.getElementById('hp-display').innerText = hp;
        invincibleTimer = 60;
        pVelocity.y = 0.3; // ノックバック
        body.material.color.setHex(0xff0000);

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

document.getElementById('save-btn').addEventListener('click', () => {
    localStorage.setItem('3d_save', JSON.stringify({ state: gameState, x: playerGroup.position.x, y: playerGroup.position.y, hp: hp }));
    alert('セーブしました！');
});
document.getElementById('load-btn').addEventListener('click', () => {
    const data = JSON.parse(localStorage.getItem('3d_save'));
    if (data) {
        if (data.state === 'hub') loadMap();
        else if (data.state === 'stage1') loadStage1();
        else if (data.state === 'stage2') loadStage2();
        else if (data.state === 'stage3') loadStage3();
        playerGroup.position.set(data.x, data.y, 0);
        hp = data.hp;
        document.getElementById('hp-display').innerText = hp;
    }
});

// AABB当たり判定（共通関数）
const isOverlap = (px, py, pw, ph, ox, oy, ow, oh) => {
    return Math.abs(px - ox) < (pw + ow) / 2 && Math.abs(py - oy) < (ph + oh) / 2;
};

// --- メインループ ---
function animate() {
    requestAnimationFrame(animate);

    if (invincibleTimer > 0) {
        invincibleTimer--;
        playerGroup.visible = (invincibleTimer % 10 < 5);
        if (invincibleTimer === 0) {
            playerGroup.visible = true;
            body.material.color.setHex(0x2196F3);
        }
    }

    // 1. 動く床の更新と、乗っているプレイヤーの追従（バグ修正済）
    platforms.forEach(p => {
        if (p.type === 'moving' && p.moveData) {
            p.time += 0.05;
            let oldX = p.x;
            let oldY = p.y;
            p.x = p.startX + Math.sin(p.time * p.moveData.speedX * 20) * p.moveData.rangeX;
            p.y = p.startY + Math.sin(p.time * p.moveData.speedY * 20) * p.moveData.rangeY;
            p.mesh.position.set(p.x, p.y, 0);

            // 床に乗っているなら、床の移動分だけプレイヤーも動かす
            if (ridingPlatform === p) {
                playerGroup.position.x += (p.x - oldX);
                playerGroup.position.y += (p.y - oldY);
            }
        }
    });

    // 2. プレイヤーのX移動と判定
    let prevX = playerGroup.position.x;
    if (keys.left) playerGroup.position.x -= moveSpeed;
    if (keys.right) playerGroup.position.x += moveSpeed;

    const pWidth = 0.8;
    const pHeight = 1.7;

    platforms.forEach(p => {
        if (p.type === 'oneway') return; 
        // 足元が床にめり込んでいる状態は「壁」と判定しない（Yの判定を-0.2縮小）
        if (isOverlap(playerGroup.position.x, playerGroup.position.y, pWidth, pHeight - 0.2, p.x, p.y, p.w, p.h)) {
            if (p.type === 'damage') takeDamage();
            else playerGroup.position.x = prevX; // 壁判定で押し戻す
        }
    });

    // 3. プレイヤーのY移動と判定
    let prevY = playerGroup.position.y;
    if (keys.jump && isGrounded) {
        pVelocity.y = jumpPower;
        isGrounded = false;
        ridingPlatform = null; // ジャンプしたら床から離れる
    }
    
    // 乗っている床が上下に動く場合を除き、基本は重力をかける
    pVelocity.y -= gravity;
    playerGroup.position.y += pVelocity.y;

    isGrounded = false;
    ridingPlatform = null; // 毎フレームリセットし、着地時に再判定する

    platforms.forEach(p => {
        if (isOverlap(playerGroup.position.x, playerGroup.position.y, pWidth, pHeight, p.x, p.y, p.w, p.h)) {
            if (p.type === 'damage') {
                takeDamage();
            } else if (p.type === 'oneway') {
                if (pVelocity.y < 0 && prevY - pHeight/2 >= p.y + p.h/2 - 0.2) {
                    playerGroup.position.y = p.y + p.h/2 + pHeight/2;
                    pVelocity.y = 0;
                    isGrounded = true;
                    ridingPlatform = p;
                }
            } else { // solid, moving
                if (pVelocity.y < 0 && prevY - pHeight/2 >= p.y + p.h/2 - 0.4) {
                    // 上から乗った
                    playerGroup.position.y = p.y + p.h/2 + pHeight/2;
                    pVelocity.y = 0;
                    isGrounded = true;
                    ridingPlatform = p;
                } else if (pVelocity.y > 0 && prevY + pHeight/2 <= p.y - p.h/2 + 0.4) {
                    // 下から天井にぶつかった
                    playerGroup.position.y = prevY;
                    pVelocity.y = 0;
                }
            }
        }
    });

    // 4. 敵の更新
    enemies.forEach(e => {
        e.vy -= gravity;
        e.x += e.vx;
        e.y += e.vy;

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

        // 簡易的な徘徊ルート
        if (Math.abs(e.x - e.mesh.position.x) > 0) {
           if(e.x > pWidth*10 || e.x < -pWidth*10) e.vx *= -1; // 簡易反転
        }

        if (e.type === 'jumper' && eGrounded && Math.random() < 0.02) {
            e.vy = 0.25;
        }

        e.mesh.position.set(e.x, e.y, 0);

        // プレイヤーとの判定
        if (isOverlap(playerGroup.position.x, playerGroup.position.y, pWidth, pHeight, e.x, e.y, e.w, e.h)) {
            if (pVelocity.y < 0 && prevY - pHeight/2 > e.y) {
                // 踏んだ
                e.y = -100; // 画面外へ
                e.vx = 0;
                pVelocity.y = jumpPower * 0.8; 
            } else {
                takeDamage();
            }
        }
    });

    // 5. ドア・ゴールの判定
    const hintUI = document.getElementById('action-hint');
    if (hintUI) hintUI.innerText = "";
    
    if (gameState === 'hub') {
        doors.forEach(d => {
            if (isOverlap(playerGroup.position.x, playerGroup.position.y, pWidth, pHeight, d.x, d.y, d.w, d.h)) {
                if (hintUI) hintUI.innerText = "↑キーで " + d.target + " へ";
                if (keys.up) {
                    keys.up = false;
                    if (d.target === 'stage1') loadStage1();
                    if (d.target === 'stage2') loadStage2();
                    if (d.target === 'stage3') loadStage3();
                }
            }
        });
    } else {
        goals.forEach(g => {
            g.mesh.rotation.y += 0.05;
            if (isOverlap(playerGroup.position.x, playerGroup.position.y, pWidth, pHeight, g.x, g.y, g.w, g.h)) {
                alert("ステージクリア！マップに戻ります。");
                hp = maxHp;
                document.getElementById('hp-display').innerText = hp;
                loadMap();
            }
        });
    }

    // 落下時の復帰
    if (playerGroup.position.y < -10) {
        takeDamage();
        if (hp > 0) {
            playerGroup.position.set(0, 5, 0);
            pVelocity.y = 0;
            ridingPlatform = null;
        }
    }

    // カメラの追従
    camera.position.x += (playerGroup.position.x - camera.position.x) * 0.1;
    camera.position.y += ((playerGroup.position.y + 3) - camera.position.y) * 0.1;
    camera.position.z = 15; // 視野を少し広く設定
    camera.lookAt(camera.position.x, camera.position.y - 1, 0);

    renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

loadMap();
animate();