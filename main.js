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

async function requestCameraAccess() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" }
    });
    stream.getTracks().forEach(track => track.stop());
    return true;
  } catch (err) {
    alert("Camera access denied. AR cannot start.");
    console.error("Camera access error:", err);
    return false;
  }
}

async function getHighestResCamera() {
  const devices = await navigator.mediaDevices.enumerateDevices();

  const backCameras = devices.filter(d => {
    if (d.kind !== 'videoinput') return false;
    const label = d.label.toLowerCase();
    if (label) {
      return !label.includes('front') && !label.includes('user');
    }
    return true;
  });

  const pool = backCameras.length > 0 ? backCameras : devices.filter(d => d.kind === 'videoinput');

  let bestCamera = null;
  let bestResolution = 0;

  for (const cam of pool) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: cam.deviceId } }
      });
      const track = stream.getVideoTracks()[0];
      const { width = 0, height = 0 } = track.getSettings();
      const resolution = width * height;

      console.log(`📷 ${cam.label || cam.deviceId}: ${width}x${height}`);

      stream.getTracks().forEach(t => t.stop());

      if (resolution > bestResolution) {
        bestResolution = resolution;
        bestCamera = cam;
      }
    } catch {
      continue;
    }
  }

  console.log(`✅ Selected: ${bestCamera?.label}`);
  return bestCamera;
}

document.addEventListener('DOMContentLoaded', async () => {

  const hasAccess = await requestCameraAccess();
  if (!hasAccess) return;

  const mainCamera = await getHighestResCamera();

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
      width: { ideal: 320, max: 320 },
      height: { ideal: 240, max: 240 },
      ...(mainCamera
        ? { deviceId: { exact: mainCamera.deviceId } }
        : { facingMode: "environment" })
    }
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
