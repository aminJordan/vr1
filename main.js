import * as THREE from 'three';
import { MindARThree } from 'mindar-image-three';

async function loadVideo(path) {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.src = path;
    video.setAttribute('crossorigin', 'anonymous');
    video.setAttribute('playsinline', '');
    video.addEventListener('loadedmetadata', () => resolve(video));
    video.addEventListener('error', (err) => reject(err));
  });
}

// دوربین اصلی رو پیدا میکنه با تست واقعی هر دوربین
async function findMainBackCamera() {
  // اول permission میگیریم
  const tempStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
  tempStream.getTracks().forEach(t => t.stop());

  const devices = await navigator.mediaDevices.enumerateDevices();
  const backCameras = devices.filter(d => {
    if (d.kind !== 'videoinput') return false;
    const label = d.label.toLowerCase();
    // دوربین جلو رو حذف میکنیم
    if (label.includes('front') || label.includes('facing front') || label.includes('user')) return false;
    return true;
  });

  console.log('Back cameras found:', backCameras.map(d => d.label));

  if (backCameras.length === 0) return null;
  if (backCameras.length === 1) return backCameras[0].deviceId;

  // از هر دوربین یه فریم میگیریم و FOV رو مقایسه میکنیم
  // دوربین اصلی معمولاً focal length بیشتری داره نسبت به ultra-wide
  // یعنی zoom بیشتر = اشیاء بزرگتر در فریم
  const cameraScores = [];

  for (const cam of backCameras) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: cam.deviceId }, width: 640, height: 480 }
      });

      const track = stream.getVideoTracks()[0];
      const settings = track.getSettings();
      const capabilities = track.getCapabilities ? track.getCapabilities() : {};

      // امتیازدهی بر اساس اطلاعات موجود
      let score = 0;

      // فاصله کانونی مستقیم (اگر مرورگر پشتیبانی کنه)
      if (settings.focusDistance !== undefined) {
        score += settings.focusDistance * 10;
      }

      // zoom level پیش‌فرض - دوربین اصلی zoom=1 داره
      if (settings.zoom !== undefined) {
        // دوربین اصلی zoom نزدیک به 1 داره
        score += (1 / Math.abs(settings.zoom - 1 + 0.001)) * 0.1;
      }

      // بررسی label برای سرنخ‌های متنی
      const label = cam.label.toLowerCase();
      if (label.includes('main')) score += 100;
      if (label.includes('wide') && !label.includes('ultra') && !label.includes('0.6') && !label.includes('0.5')) score += 50;
      if (label.includes('ultra') || label.includes('0.6') || label.includes('0.5') || label.includes('0.7')) score -= 100;
      if (label.includes('telephoto') || label.includes('tele')) score -= 50;
      if (label.includes('camera2 0') || label.includes('back camera 0') || label.includes('back, 0')) score += 80;
      if (label.includes('camera2 1') || label.includes('back camera 1') || label.includes('back, 1')) score += 30;

      // اندازه تصویر - دوربین اصلی معمولاً بهترین رزولوشن داره
      if (capabilities.width?.max) {
        score += capabilities.width.max / 10000;
      }

      console.log(`Camera: ${cam.label} | Score: ${score} | Settings:`, settings);

      stream.getTracks().forEach(t => t.stop());

      cameraScores.push({ deviceId: cam.deviceId, label: cam.label, score });
    } catch (err) {
      console.warn(`Could not test camera ${cam.label}:`, err);
    }
  }

  if (cameraScores.length === 0) return null;

  // دوربین با بیشترین امتیاز رو انتخاب میکنیم
  cameraScores.sort((a, b) => b.score - a.score);
  console.log('Selected camera:', cameraScores[0].label);

  return cameraScores[0].deviceId;
}

document.addEventListener('DOMContentLoaded', async () => {

  let mainCameraId = null;

  try {
    mainCameraId = await findMainBackCamera();
    console.log('Main camera deviceId:', mainCameraId);
  } catch (err) {
    console.warn('Could not find main camera, falling back to environment:', err);
  }

  const videoSettings = mainCameraId
    ? { deviceId: { exact: mainCameraId } }
    : { facingMode: { ideal: 'environment' } };

  const mindarThree = new MindARThree({
    container: document.querySelector("#ar-container"),
    imageTargetSrc: './assets/targets/pedar.mind',
    filterMinCF: 0.002,
    filterBeta: 0.0005,
    maxTrack: 1,
    missTolerance: 10,
    warmupTolerance: 10,
    uiLoading: "yes",
    uiError: "yes",
    uiScanning: "no",
    videoSettings
  });

  const { renderer, scene, camera } = mindarThree;

  const video = await loadVideo("./assets/videos/notopia.mp4");
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

});
