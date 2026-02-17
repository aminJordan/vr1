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

document.addEventListener('DOMContentLoaded', async () => {

  // تابع برای گرفتن دسترسی دوربین
  async function requestCameraAccess() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach(track => track.stop());
      return true;
    } catch (err) {
      alert("Camera access denied. AR cannot start.");
      console.error("Camera access error:", err);
      return false;
    }
  }

  const hasAccess = await requestCameraAccess();
  if (!hasAccess) return;

  // شروع AR بعد از گرفتن دسترسی با فیلترهای smoothing
  const mindarThree = new MindARThree({
    container: document.querySelector("#ar-container"),
    imageTargetSrc: './assets/targets/notopia.mind',
    filterMinCF: 0.0001, // کاهش این عدد لرزش را در حالت سکون حذف می‌کند
    filterBeta: 0.001,    // تنظیم این عدد حرکت را نرم‌تر می‌کند
    maxTrack: 1,
    missTolerance: 5,
    warmupTolerance: 5,
    uiLoading: "yes",
    uiError: "yes",
    uiScanning: "no"
  });

  const { renderer, scene, camera } = mindarThree;

  const video = await loadVideo("./assets/videos/notopia.mp4");
  const texture = new THREE.VideoTexture(video);

  const geometry = new THREE.PlaneGeometry(1, 216/384);
  const material = new THREE.MeshBasicMaterial({map: texture});
  const plane = new THREE.Mesh(geometry, material);

  const anchor = mindarThree.addAnchor(0);
  anchor.group.add(plane);

  anchor.onTargetFound = () => {
    video.play();
  }
  anchor.onTargetLost = () => {
    video.pause();
  }
  video.addEventListener('play', () => {
    video.currentTime = 0;
  });

  await mindarThree.start();
  renderer.setAnimationLoop(() => {
    renderer.render(scene, camera);
  });

});
