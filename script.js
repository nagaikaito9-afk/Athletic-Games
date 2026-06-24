// --- 基本設定とリアルな描画設定 ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x5CB3FF); // 鮮やかな空色
scene.fog = new THREE.FogExp2(0x5CB3FF, 0.015);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
dirLight.position.set(10, 20, 15);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
scene.add(dirLight);
scene.add(new THREE.AmbientLight(0xffffff, 0.6));

// --- プログラムでテクスチャ（模様）を生成する関数 ---
// 画像ファイルを使わず、ブロックの種類を視覚的にわかりやすくします
function createTexture(type) {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 256;
    const ctx = canvas.getContext('2d');

    if (type === 'solid') {
        // レンガ模様（普通の足場）
        ctx.fillStyle = '#8BC34A'; ctx.fillRect(0, 0, 256, 256);
        ctx.strokeStyle = '#558B2F'; ctx.lineWidth = 6;
        for (let i = 0; i < 4; i++) {
            ctx.beginPath(); ctx.moveTo(0, i * 64); ctx.lineTo(256, i * 64); ctx.stroke();
            for (let j = 0; j < 4; j++) {
                let offset = (i % 2 === 0) ? 0 : 32;
                ctx.beginPath(); ctx.moveTo(j * 64 + offset, i * 64); ctx.lineTo(j * 64 + offset, i * 64 + 64); ctx.stroke();
            }
        }
    } else if (type === 'moving') {
        // しましま・矢印模様（動く床）
        ctx.fillStyle = '#9C27B0'; ctx.fillRect(0, 0, 256, 256);
        ctx.fillStyle = '#E1BEE7';
        for (let i = 0; i < 256; i += 64) ctx.fillRect(i, 0, 32, 256);
    } else if (type === 'oneway') {
        // 上向き矢印模様（下からすり抜けられる床）
        ctx.fillStyle = '#FF9800'; ctx.fillRect(0, 0, 256, 256);
        ctx.fillStyle = '#FFE0B2';
        ctx.beginPath(); ctx.moveTo(128, 40); ctx.lineTo(200, 160); ctx.lineTo(56, 160); ctx.fill();
        ctx.fillRect(108, 160, 40, 60);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
}

const textures = {
    solid: createTexture('solid'),
    moving: createTexture('moving'),
    oneway: createTexture('oneway')
};

// --- 背景の雲（飾り） ---
function createClouds() {
    const cloudGeo = new THREE.SphereGeometry(1.5, 16, 16);
    const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.8 });
    for (let i = 0; i < 20; i++) {
        const cloud = new THREE.Group();
        for (let j = 0; j < 3; j++) {
            const puff = new THREE.Mesh(cloudGeo, cloudMat);
            puff.position.set(j * 1.2 - 1.2, Math.random() * 0.5, Math.random() * 1 - 0.5);
            puff.scale.setScalar(Math.random() * 0.5 + 0.5);
            cloud.add(puff);
        }
        cloud.position.set(Math.random() * 80 - 10, Math.random() * 10 + 5, -15 - Math.random() * 10);
        scene.add(cloud);
    }
}
createClouds();

// --- ゲーム状態管理 ---
let gameState = 'hub';
let hp = 10;
const maxHp = 10;
let invincibleTimer = 0;

// --- プレイヤーの作成（目をつけて向きをわかりやすく） ---
const playerGroup = new THREE.Group();
const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2196F3, roughness: 0.3 });
const body = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 1, 16), bodyMat);
body.castShadow = true;

const head = new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 16), new THREE.MeshStandardMaterial({ color: 0xFFEB3B }));
head.position.y = 0.7;
head.castShadow = true;

// 目
const eyeGeo = new THREE.SphereGeometry(0.06, 8, 8);
const eyeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
const eyeR = new THREE.Mesh(eyeGeo, eyeMat); eyeR.position.set(0.15, 0.75, 0.3);
const eyeL = new THREE.Mesh(eyeGeo, eyeMat); eyeL.position.set(-0.15, 0.75, 0.3);

playerGroup.add(body, head, eyeR, eyeL);
scene.add(playerGroup);

let pVelocity = { x: 0, y: 0 };
const gravity = 0.015;
const jumpPower = 0.36;
const moveSpeed = 0.15;
let isGrounded = false;
let ridingPlatform = null;
let facingRight = true; // プレイヤーの向き

// --- ステージ構成要素 ---
let platforms = [];
let enemies = [];
let doors = [];
let goals = [];

// --- オブジェクト生成関数 ---
function createPlatform(x, y, w, h, type = 'solid', moveData = null) {
    const group = new THREE.Group();
    group.position.set(x, y, 0);

    if (type === 'damage') {
        // ダメージ床は「土台 ＋ トゲトゲ（円錐）」で表現
        const baseGeo = new THREE.BoxGeometry(w, h * 0.5, 2);
        const baseMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
        const base = new THREE.Mesh(baseGeo, baseMat);
        base.position.y = -h * 0.25;
        base.castShadow = true; group.add(base);

        const spikeGeo = new THREE.ConeGeometry(0.4, h * 0.5, 8);
        const spikeMat = new THREE.MeshStandardMaterial({ color: 0xF44336, metalness: 0.5 });
        const spikeCount = Math.floor(w);
        for (let i = 0; i < spikeCount; i++) {
            const spike = new THREE.Mesh(spikeGeo, spikeMat);
            spike.position.set((i - spikeCount / 2 + 0.5) * (w / spikeCount), h * 0.25, 0);
            spike.castShadow = true; group.add(spike);
        }
    } else {
        const geo = new THREE.BoxGeometry(w, h, 2);
        const mat = new THREE.MeshStandardMaterial({ map: textures[type] });
        mat.map.repeat.set(w / 2, h / 2); // テクスチャのサイズ調整
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = true; mesh.receiveShadow = true;
        group.add(mesh);
    }

    scene.add(group);
    platforms.push({ mesh: group, x, y, w, h, type, moveData, startX: x, startY: y, time: 0 });
}

function createEnemy(x, y, type = 'walker') {
    const group = new THREE.Group();
    group.position.set(x, y, 0);

    if (type === 'walker') {
        // 歩く敵（スライム風の半球）
        const geo = new THREE.SphereGeometry(0.5, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2);
        const mat = new THREE.MeshStandardMaterial({ color: 0x4CAF50, roughness: 0.1 });
        const body = new THREE.Mesh(geo, mat);
        body.position.y = -0.5; body.castShadow = true; group.add(body);
        
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), new THREE.MeshBasicMaterial({color: 0xffffff}));
        eye.position.set(0, -0.2, 0.45);
        const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), new THREE.MeshBasicMaterial({color: 0x000000}));
        pupil.position.set(0, -0.2, 0.52);
        group.add(eye, pupil);
    } else {
        // 跳ねる敵（バネ付きブロック風）
        const geo = new THREE.BoxGeometry(0.8, 0.8, 0.8);
        const mat = new THREE.MeshStandardMaterial({ color: 0xFF5722, metalness: 0.5 });
        const body = new THREE.Mesh(geo, mat);
        body.castShadow = true; group.add(body);
        
        const spring = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.5, 8), new THREE.MeshStandardMaterial({color: 0x999999, wireframe: true}));
        spring.position.y = -0.65; group.add(spring);
    }

    scene.add(group);
    enemies.push({ mesh: group, x, y, w: 1, h: type==='walker'?1:1.3, type, vx: 0.05, vy: 0 });
}

function createDoor(x, y, targetStage) {
    const group = new THREE.Group();
    group.position.set(x, y + 0.75, -1);
    
    // ドア枠と扉
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.5, 0.5), new THREE.MeshStandardMaterial({ color: 0x5D4037 }));
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.15), new THREE.MeshStandardMaterial({ color: 0xFFD700 }));
    knob.position.set(0.5, 0, 0.3);
    
    group.add(door, knob);
    scene.add(group);
    doors.push({ mesh: group, x, y, w: 1.5, h: 2.5, target: targetStage });
}

function createGoal(x, y) {
    const group = new THREE.Group();
    group.position.set(x, y + 1, 0);
    
    const starShape = new THREE.Shape();
    // 星型の頂点計算
    for(let i=0; i<10; i++) {
        let r = i%2===0 ? 0.8 : 0.3;
        let a = (Math.PI/5) * i;
        if(i===0) starShape.moveTo(Math.sin(a)*r, Math.cos(a)*r);
        else starShape.lineTo(Math.sin(a)*r, Math.cos(a)*r);
    }
    const geo = new THREE.ExtrudeGeometry(starShape, { depth: 0.2, bevelEnabled: true, bevelThickness: 0.05 });
    const mat = new THREE.MeshStandardMaterial({ color: 0xFFEB3B, emissive: 0x888800 });
    const star = new THREE.Mesh(geo, mat);
    
    group.add(star);
    scene.add(group);
    goals.push({ mesh: group, x, y, w: 1.6, h: 1.6 });
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
    clearScene(); gameState = 'hub';
    document.getElementById('stage-display').innerText = 'マップ（ハブ）';
    playerGroup.position.set(0, 2, 0); pVelocity = { x: 0, y: 0 };

    createPlatform(5, 0, 30, 1, 'solid');
    createDoor(0, 0.5, 'stage1');
    createDoor(5, 0.5, 'stage2');
    createDoor(10, 0.5, 'stage3');
}

function loadStage1() {
    clearScene(); gameState = 'stage1';
    document.getElementById('stage-display').innerText = 'ステージ1 (チュートリアル)';
    playerGroup.position.set(0, 2, 0); pVelocity = { x: 0, y: 0 };

    createPlatform(0, 0, 8, 1, 'solid');
    createPlatform(10, 0, 6, 1, 'solid');
    createEnemy(10, 2, 'walker');
    createPlatform(15, 2, 2, 0.5, 'oneway');
    createPlatform(18, 4, 2, 0.5, 'oneway');
    createPlatform(24, 0, 10, 1, 'damage');
    createPlatform(24, 4, 3, 0.5, 'moving', { speedX: 0.05, rangeX: 3, speedY: 0, rangeY: 0 });
    createPlatform(31, 4, 5, 1, 'solid');
    createGoal(32, 4.5);
}

function loadStage2() {
    clearScene(); gameState = 'stage2';
    document.getElementById('stage-display').innerText = 'ステージ2 (縦の試練)';
    playerGroup.position.set(0, 2, 0); pVelocity = { x: 0, y: 0 };

    createPlatform(0, 0, 6, 1, 'solid');
    createPlatform(-2, 3, 3, 0.5, 'oneway');
    createPlatform(3, 6, 3, 0.5, 'oneway');
    createPlatform(-2, 9, 3, 0.5, 'oneway');
    createPlatform(4, 11, 3, 0.5, 'moving', { speedX: 0, rangeX: 0, speedY: 0.04, rangeY: 3 });
    createPlatform(10, 14, 6, 1, 'solid');
    createEnemy(10, 16, 'jumper');
    createGoal(11, 14.5);
}

function loadStage3() {
    clearScene(); gameState = 'stage3';
    document.getElementById('stage-display').innerText = 'ステージ3 (アスレチックマスター)';
    playerGroup.position.set(0, 2, 0); pVelocity = { x: 0, y: 0 };

    createPlatform(0, 0, 4, 1, 'solid');
    createPlatform(6, 0, 3, 0.5, 'moving', { speedX: 0.05, rangeX: 3, speedY: 0, rangeY: 0 });
    createPlatform(13, 2, 4, 1, 'solid');
    createEnemy(13, 4, 'jumper');
    createPlatform(21, 0, 12, 1, 'damage'); 
    createPlatform(18, 4, 2, 0.5, 'oneway');
    createPlatform(21, 5, 2, 0.5, 'oneway');
    createPlatform(24, 6, 2, 0.5, 'oneway');
    createPlatform(28, 8, 3, 0.5, 'moving', { speedX: 0, rangeX: 0, speedY: 0.05, rangeY: 3 });
    createPlatform(34, 10, 5, 1, 'solid');
    createGoal(34, 10.5);
}

function takeDamage() {
    if (invincibleTimer <= 0) {
        hp -= 1;
        document.getElementById('hp-display').innerText = hp;
        invincibleTimer = 60;
        pVelocity.y = 0.3; 
        body.material.color.setHex(0xff0000);

        if (hp <= 0) {
            alert("ゲームオーバー！マップに戻ります。");
            hp = maxHp; document.getElementById('hp-display').innerText = hp;
            loadMap();
        }
    }
}

// --- 入力処理 ---
const keys = { left: false, right: false, jump: false, up: false };
window.addEventListener('keydown', (e) => {
    if (e.code === 'ArrowLeft') { keys.left = true; facingRight = false; }
    if (e.code === 'ArrowRight') { keys.right = true; facingRight = true; }
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
        else if (data.state === 'stage2') loadStage2();
        else if (data.state === 'stage3') loadStage3();
        playerGroup.position.set(data.x, data.y, 0);
        hp = data.hp; document.getElementById('hp-display').innerText = hp;
    }
});

const isOverlap = (px, py, pw, ph, ox, oy, ow, oh) => {
    return Math.abs(px - ox) < (pw + ow) / 2 && Math.abs(py - oy) < (ph + oh) / 2;
};

// --- メインループ ---
function animate() {
    requestAnimationFrame(animate);

    // プレイヤーの向きを滑らかに変更
    const targetRot = facingRight ? 0 : Math.PI;
    playerGroup.rotation.y += (targetRot - playerGroup.rotation.y) * 0.2;

    if (invincibleTimer > 0) {
        invincibleTimer--;
        playerGroup.visible = (invincibleTimer % 10 < 5);
        if (invincibleTimer === 0) {
            playerGroup.visible = true;
            body.material.color.setHex(0x2196F3);
        }
    }

    platforms.forEach(p => {
        if (p.type === 'moving' && p.moveData) {
            p.time += 0.05;
            let oldX = p.x; let oldY = p.y;
            p.x = p.startX + Math.sin(p.time * p.moveData.speedX * 20) * p.moveData.rangeX;
            p.y = p.startY + Math.sin(p.time * p.moveData.speedY * 20) * p.moveData.rangeY;
            p.mesh.position.set(p.x, p.y, 0);

            if (ridingPlatform === p) {
                playerGroup.position.x += (p.x - oldX);
                playerGroup.position.y += (p.y - oldY);
            }
        }
    });

    let prevX = playerGroup.position.x;
    if (keys.left) playerGroup.position.x -= moveSpeed;
    if (keys.right) playerGroup.position.x += moveSpeed;

    const pWidth = 0.8; const pHeight = 1.7;

    platforms.forEach(p => {
        if (p.type === 'oneway') return; 
        if (isOverlap(playerGroup.position.x, playerGroup.position.y, pWidth, pHeight - 0.2, p.x, p.y, p.w, p.h)) {
            if (p.type === 'damage') takeDamage();
            else playerGroup.position.x = prevX;
        }
    });

    let prevY = playerGroup.position.y;
    if (keys.jump && isGrounded) {
        pVelocity.y = jumpPower;
        isGrounded = false;
        ridingPlatform = null; 
    }
    
    pVelocity.y -= gravity;
    playerGroup.position.y += pVelocity.y;

    isGrounded = false; ridingPlatform = null; 

    platforms.forEach(p => {
        if (isOverlap(playerGroup.position.x, playerGroup.position.y, pWidth, pHeight, p.x, p.y, p.w, p.h)) {
            if (p.type === 'damage') {
                takeDamage();
            } else if (p.type === 'oneway') {
                if (pVelocity.y < 0 && prevY - pHeight/2 >= p.y + p.h/2 - 0.2) {
                    playerGroup.position.y = p.y + p.h/2 + pHeight/2;
                    pVelocity.y = 0; isGrounded = true; ridingPlatform = p;
                }
            } else {
                if (pVelocity.y < 0 && prevY - pHeight/2 >= p.y + p.h/2 - 0.4) {
                    playerGroup.position.y = p.y + p.h/2 + pHeight/2;
                    pVelocity.y = 0; isGrounded = true; ridingPlatform = p;
                } else if (pVelocity.y > 0 && prevY + pHeight/2 <= p.y - p.h/2 + 0.4) {
                    playerGroup.position.y = prevY; pVelocity.y = 0;
                }
            }
        }
    });

    enemies.forEach(e => {
        e.vy -= gravity; e.x += e.vx; e.y += e.vy;

        let eGrounded = false;
        platforms.forEach(p => {
            if (p.type !== 'oneway' && isOverlap(e.x, e.y, e.w, e.h, p.x, p.y, p.w, p.h)) {
                if (e.vy < 0) { e.y = p.y + p.h/2 + e.h/2; e.vy = 0; eGrounded = true; }
            }
        });

        if (Math.abs(e.x - e.mesh.position.x) > 0) {
           if(e.x > pWidth*10 || e.x < -pWidth*10) {
               e.vx *= -1; 
               e.mesh.rotation.y = e.vx > 0 ? Math.PI : 0; // 歩く方向を向く
           }
        }

        if (e.type === 'jumper' && eGrounded && Math.random() < 0.02) e.vy = 0.25;

        e.mesh.position.set(e.x, e.y, 0);

        if (isOverlap(playerGroup.position.x, playerGroup.position.y, pWidth, pHeight, e.x, e.y, e.w, e.h)) {
            if (pVelocity.y < 0 && prevY - pHeight/2 > e.y) {
                e.y = -100; e.vx = 0; pVelocity.y = jumpPower * 0.8; 
            } else {
                takeDamage();
            }
        }
    });

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
            g.mesh.rotation.y += 0.05; // ゴールの星を回転
            if (isOverlap(playerGroup.position.x, playerGroup.position.y, pWidth, pHeight, g.x, g.y, g.w, g.h)) {
                alert("ステージクリア！マップに戻ります。");
                hp = maxHp; document.getElementById('hp-display').innerText = hp;
                loadMap();
            }
        });
    }

    if (playerGroup.position.y < -10) {
        takeDamage();
        if (hp > 0) {
            playerGroup.position.set(0, 5, 0);
            pVelocity.y = 0; ridingPlatform = null;
        }
    }

    camera.position.x += (playerGroup.position.x - camera.position.x) * 0.1;
    camera.position.y += ((playerGroup.position.y + 3) - camera.position.y) * 0.1;
    camera.position.z = 15; 
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