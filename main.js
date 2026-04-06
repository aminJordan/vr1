import * as THREE from 'three';
import { MindARThree } from 'mindar-image-three';

async function loadVideo(path) {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.src = path;
    video.setAttribute('crossorigin', 'anonymous');
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.muted = true;
    video.loop = true;
    video.preload = "auto";

    video.addEventListener('loadedmetadata', () => resolve(video));
    video.addEventListener('error', (err) => reject(err));
  });
}

// 🔥 پیدا کردن دوربین اصلی پشت
async function getBackCameraDeviceId() {
  const devices = await navigator.mediaDevices.enumerateDevices();

  const videoDevices = devices.filter(d => d.kind === 'videoinput');

  // دیباگ (اختیاری)
  console.log("Cameras:", videoDevices);

  // تلاش برای پیدا کردن لنز اصلی (نه wide)
  let backCamera = videoDevices.find(d =>
    d.label.toLowerCase().includes('back') &&
    !d.label.toLowerCase().includes('wide')
  );

  // اگر پیدا نشد، اولین دوربین پشت
  if (!backCamera) {
    backCamera = videoDevices.find(d =>
      d.label.toLowerCase().includes('back')
    );
  }

  // اگر باز هم نشد، آخری (معمولاً بهترین)
  if (!backCamera) {
    backCamera = videoDevices[videoDevices.length - 1];
  }

  return backCamera?.deviceId;
}

document.addEventListener('DOMContentLoaded', async () => {

  async function requestCameraAccess() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach(track => track.stop());
      return true;
    } catch (err) {
      alert("Camera access denied. AR cannot start.");
      console.error(err);
      return false;
    }
  }

  const hasAccess = await requestCameraAccess();
  if (!hasAccess) return;

  const deviceId = await getBackCameraDeviceId();

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

    videoSettings: {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      width: { ideal: 1920 },
      height: { ideal: 1080 }
    }
  });

  const { renderer, scene, camera } = mindarThree;

  // 🔥 کیفیت رندر
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.physicallyCorrectLights = true;

  const video = await loadVideo("./assets/videos/notopia.mp4");

  const texture = new THREE.VideoTexture(video);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.format = THREE.RGBAFormat;
  texture.generateMipmaps = false;

  const geometry = new THREE.PlaneGeometry(1, 1, 32, 32);
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
