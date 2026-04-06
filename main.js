import * as THREE from 'three';
import { MindARThree } from 'mindar-image-three';

// ─── Load video helper ───────────────────────────────────────────────────────
async function loadVideo(path) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.src = path;
    video.setAttribute('crossorigin', 'anonymous');
    video.setAttribute('playsinline', '');
    video.addEventListener('loadedmetadata', () => resolve(video));
    video.addEventListener('error', (err) => reject(err));
  });
}

// ─── Show error inside picker UI ─────────────────────────────────────────────
function showPickerError(msg) {
  const el = document.getElementById('picker-error');
  el.textContent = msg;
  el.classList.add('visible');
}

// ─── Build camera list UI ────────────────────────────────────────────────────
function buildCameraList(cameras) {
  const listEl = document.getElementById('camera-list');
  const startBtn = document.getElementById('start-btn');
  listEl.innerHTML = '';

  if (cameras.length === 0) {
    listEl.innerHTML = '<p style="font-size:12px;color:#ff6b6b">هیچ دوربینی پیدا نشد.</p>';
    return;
  }

  let selectedDeviceId = null;

  // تشخیص نوع دوربین بر اساس label
  function guessIcon(label) {
    const l = label.toLowerCase();
    if (l.includes('front') || l.includes('user') || l.includes('selfie') || l.includes('facetime')) return '🤳';
    if (l.includes('back') || l.includes('rear') || l.includes('environment')) return '📷';
    return '🎥';
  }

  function guessType(label, index) {
    const l = label.toLowerCase();
    if (l.includes('front') || l.includes('user') || l.includes('selfie') || l.includes('facetime')) return 'دوربین جلو';
    if (l.includes('back') || l.includes('rear') || l.includes('environment')) return 'دوربین عقب';
    return `دوربین ${index + 1}`;
  }

  cameras.forEach((cam, i) => {
    const btn = document.createElement('button');
    btn.className = 'camera-option';
    btn.dataset.deviceId = cam.deviceId;

    const icon = guessIcon(cam.label);
    const typeLabel = guessType(cam.label, i);
    const shortId = cam.deviceId ? cam.deviceId.substring(0, 20) + '…' : 'ID نامشخص';
    const rawLabel = cam.label || `Camera ${i + 1}`;

    btn.innerHTML = `
      <span class="cam-icon">${icon}</span>
      <span class="cam-info">
        <span class="cam-label">${typeLabel} — ${rawLabel}</span>
        <span class="cam-id">deviceId: ${shortId}</span>
      </span>
      <span class="cam-badge">انتخاب شد</span>
    `;

    btn.addEventListener('click', () => {
      // deselect همه
      listEl.querySelectorAll('.camera-option').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedDeviceId = cam.deviceId;
      startBtn.disabled = false;

      console.log(`[CameraPicker] Selected: "${rawLabel}" | deviceId: ${cam.deviceId}`);
    });

    listEl.appendChild(btn);
  });

  // اگه فقط یه دوربین هست، خودکار انتخاب کن
  if (cameras.length === 1) {
    listEl.querySelector('.camera-option').click();
  }

  return () => selectedDeviceId;
}

// ─── Start AR with chosen deviceId ───────────────────────────────────────────
async function startAR(deviceId) {
  // مخفی کردن picker، نشون دادن ar-container
  document.getElementById('camera-picker').style.display = 'none';
  const arContainer = document.getElementById('ar-container');
  arContainer.style.display = 'block';

  const mindarThree = new MindARThree({
    container: arContainer,
    imageTargetSrc: './assets/targets/pedar.mind',
    filterMinCF: 0.002,
    filterBeta: 0.0005,
    maxTrack: 1,
    missTolerance: 10,
    warmupTolerance: 10,
    uiLoading: 'yes',
    uiError: 'yes',
    uiScanning: 'no',
    videoSettings: {
      deviceId: { exact: deviceId },
      width: { ideal: 320, max: 320 },
      height: { ideal: 240, max: 240 }
    }
  });

  const { renderer, scene, camera } = mindarThree;

  const video = await loadVideo('./assets/videos/notopia.mp4');
  const texture = new THREE.VideoTexture(video);

  const geometry = new THREE.PlaneGeometry(1, 1);
  const material = new THREE.MeshBasicMaterial({ map: texture });
  const plane = new THREE.Mesh(geometry, material);

  const anchor = mindarThree.addAnchor(0);
  anchor.group.add(plane);

  const smoothPosition = new THREE.Vector3();
  const smoothQuaternion = new THREE.Quaternion();
  let isTracking = false;

  anchor.onTargetFound = () => {
    isTracking = true;
    smoothPosition.copy(anchor.group.position);
    smoothQuaternion.copy(anchor.group.quaternion);
    video.play();
  };

  anchor.onTargetLost = () => {
    isTracking = false;
    video.pause();
  };

  video.addEventListener('play', () => {
    video.currentTime = 0;
  });

  await mindarThree.start();

  renderer.setAnimationLoop(() => {
    if (isTracking) {
      smoothPosition.lerp(anchor.group.position, 0.1);
      smoothQuaternion.slerp(anchor.group.quaternion, 0.1);

      anchor.group.position.copy(smoothPosition);
      anchor.group.quaternion.copy(smoothQuaternion);
    }
    renderer.render(scene, camera);
  });
}

// ─── Entry point ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // مرحله ۱: درخواست دسترسی دوربین (لازمه تا label ها خوانده بشن)
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  } catch (err) {
    showPickerError('دسترسی به دوربین رد شد. لطفاً مجوز را بدهید و صفحه را reload کنید.');
    console.error('[CameraPicker] getUserMedia error:', err);
    return;
  }

  // بعد از گرفتن مجوز، stream رو می‌بندیم — MindAR بعداً خودش باز می‌کنه
  stream.getTracks().forEach(track => track.stop());

  // مرحله ۲: لیست دوربین‌ها
  let cameras;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    cameras = devices.filter(d => d.kind === 'videoinput');
    console.log('[CameraPicker] Found cameras:', cameras);
  } catch (err) {
    showPickerError('خطا در دریافت لیست دوربین‌ها.');
    console.error('[CameraPicker] enumerateDevices error:', err);
    return;
  }

  // مرحله ۳: نمایش UI انتخاب
  const getSelectedId = buildCameraList(cameras);

  // مرحله ۴: دکمه شروع
  document.getElementById('start-btn').addEventListener('click', async () => {
    const deviceId = getSelectedId();
    if (!deviceId) return;

    document.getElementById('start-btn').disabled = true;
    document.getElementById('start-btn').textContent = 'در حال راه‌اندازی…';

    try {
      await startAR(deviceId);
    } catch (err) {
      // اگه AR شروع نشد، picker رو دوباره نشون بده
      document.getElementById('camera-picker').style.display = 'flex';
      document.getElementById('ar-container').style.display = 'none';
      document.getElementById('start-btn').disabled = false;
      document.getElementById('start-btn').textContent = 'شروع AR';
      showPickerError(`خطا در راه‌اندازی AR: ${err.message || err}`);
      console.error('[AR] start error:', err);
    }
  });
});
