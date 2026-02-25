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

async function getBackCameras() {
  // اول permission میگیریم تا label ها نمایش داده بشن
  const tempStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
  tempStream.getTracks().forEach(t => t.stop());

  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter(d => {
    if (d.kind !== 'videoinput') return false;
    const label = d.label.toLowerCase();
    return !label.includes('front') && !label.includes('facing front') && !label.includes('user');
  });
}

function showCameraSelector(cameras) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed; inset: 0; background: rgba(0,0,0,0.85);
      display: flex; flex-direction: column; align-items: center;
      justify-content: center; z-index: 9999; gap: 12px; padding: 24px;
    `;

    const title = document.createElement('p');
    title.textContent = 'دوربین اصلی را انتخاب کنید:';
    title.style.cssText = 'color: white; font-size: 18px; margin-bottom: 8px; font-family: sans-serif;';
    overlay.appendChild(title);

    cameras.forEach((cam, i) => {
      const btn = document.createElement('button');
      // label رو خوانا میکنیم
      const rawLabel = cam.label || `Camera ${i + 1}`;
      btn.textContent = rawLabel;
      btn.style.cssText = `
        width: 100%; max-width: 360px; padding: 14px 20px;
        background: #1e88e5; color: white; border: none; border-radius: 10px;
        font-size: 15px; font-family: sans-serif; cursor: pointer;
      `;
      btn.addEventListener('click', () => {
        document.body.removeChild(overlay);
        resolve(cam.deviceId);
      });
      overlay.appendChild(btn);
    });

    document.body.appendChild(overlay);
  });
}

document.addEventListener('DOMContentLoaded', async () => {

  let selectedDeviceId = null;

  try {
    const backCameras = await getBackCameras();
    console.log('Cameras:', backCameras.map(c => c.label));

    if (backCameras.length === 0) {
      alert("No back camera found.");
      return;
    } else if (backCameras.length === 1) {
      selectedDeviceId = backCameras[0].deviceId;
    } else {
      // بیش از یه دوربین عقب داریم → کاربر انتخاب کنه
      selectedDeviceId = await showCameraSelector(backCameras);
    }
  } catch (err) {
    console.warn('Camera selection failed, using environment fallback:', err);
  }

  const videoSettings = selectedDeviceId
    ? { deviceId: { exact: selectedDeviceId } }
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
