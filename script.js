// --- 基本設定 ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB); // 背景色（空）

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// ライトの追加
const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(5, 10, 5);
scene.add(light);
scene.add(new THREE.AmbientLight(0x404040));

// --- プレイヤーの設定 ---
const playerSize = 1;
const playerGeometry = new THREE.BoxGeometry(playerSize, playerSize, playerSize);
const playerMaterial = new THREE.MeshStandardMaterial({ color: 0xff4444 });
const player = new THREE.Mesh(playerGeometry, playerMaterial);
scene.add(player);

// 物理演算用変数
let velocity = { x: 0, y: 0 };
const gravity = 0.015;
const jumpPower = 0.35;
const moveSpeed = 0.15;
let isGrounded = false;

// --- ステージ（足場）の設定 ---
const platforms = [];
const platformMaterial = new THREE.MeshStandardMaterial({ color: 0x4CAF50 });

// 足場を生成する関数
function createPlatform(x, y, z, width, height, depth) {
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const platform = new THREE.Mesh(geometry, platformMaterial);
    platform.position.set(x, y, z);
    scene.add(platform);
    
    // 当たり判定用のデータをオブジェクトに保持
    platforms.push({
        mesh: platform,
        left: x - width / 2,
        right: x + width / 2,
        top: y + height / 2,
        bottom: y - height / 2
    });
}

// 初期ステージの構築（上に進むアスレチック）
createPlatform(0, -2, 0, 10, 1, 2); // スタート地点
createPlatform(3, 2, 0, 4, 0.5, 2);
createPlatform(-3, 6, 0, 4, 0.5, 2);
createPlatform(2, 10, 0, 3, 0.5, 2);
createPlatform(-2, 14, 0, 3, 0.5, 2);
createPlatform(0, 18, 0, 5, 0.5, 2); // ゴールや中間地点の想定

// --- 入力処理 ---
const keys = { left: false, right: false, jump: false };

window.addEventListener('keydown', (e) => {
    if (e.code === 'ArrowLeft') keys.left = true;
    if (e.code === 'ArrowRight') keys.right = true;
    if (e.code === 'Space') keys.jump = true;
});

window.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowLeft') keys.left = false;
    if (e.code === 'ArrowRight') keys.right = false;
    if (e.code === 'Space') keys.jump = false;
});

// --- セーブ・ロード機能 ---
const SAVE_KEY = '3d_athletic_save';

document.getElementById('save-btn').addEventListener('click', () => {
    const saveData = {
        x: player.position.x,
        y: player.position.y
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(saveData));
    alert('現在位置をセーブしました！');
});

document.getElementById('load-btn').addEventListener('click', () => {
    const saveData = localStorage.getItem(SAVE_KEY);
    if (saveData) {
        const parsed = JSON.parse(saveData);
        player.position.set(parsed.x, parsed.y, 0);
        velocity.y = 0;
        alert('データをロードしました！');
    } else {
        alert('セーブデータがありません。');
    }
});

document.getElementById('reset-btn').addEventListener('click', () => {
    player.position.set(0, 0, 0);
    velocity.y = 0;
});

// UIの高さ表示要素
const heightDisplay = document.getElementById('height-display');

// --- ゲームループ（毎フレーム更新） ---
function animate() {
    requestAnimationFrame(animate);

    // 左右移動
    if (keys.left) player.position.x -= moveSpeed;
    if (keys.right) player.position.x += moveSpeed;

    // ジャンプ
    if (keys.jump && isGrounded) {
        velocity.y = jumpPower;
        isGrounded = false;
    }

    // 重力の適用
    velocity.y -= gravity;
    player.position.y += velocity.y;

    // 衝突判定のリセット
    isGrounded = false;

    // 簡易的な当たり判定（AABB）
    const pRadius = playerSize / 2;
    for (const p of platforms) {
        // X軸の範囲内にいるか
        if (player.position.x + pRadius > p.left && player.position.x - pRadius < p.right) {
            // 上から足場に乗る判定（めり込み防止）
            if (player.position.y - pRadius <= p.top && player.position.y - pRadius >= p.top - 0.5) {
                if (velocity.y < 0) { // 落下中のみ
                    player.position.y = p.top + pRadius; // 足場の上に固定
                    velocity.y = 0;
                    isGrounded = true;
                }
            }
        }
    }

    // 落下判定（落ちたら初期位置に戻る）
    if (player.position.y < -10) {
        player.position.set(0, 0, 0);
        velocity.y = 0;
    }

    // カメラの追従（プレイヤーのY座標に合わせて上に移動）
    camera.position.x = player.position.x * 0.5; // 少しだけ左右に追従
    camera.position.y = player.position.y + 3;
    camera.position.z = 15;
    camera.lookAt(player.position.x, player.position.y, 0);

    // 高さのスコア更新
    heightDisplay.innerText = Math.max(0, Math.floor(player.position.y)).toString();

    renderer.render(scene, camera);
}

// リサイズ対応
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// ゲーム開始
animate();