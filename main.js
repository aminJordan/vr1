import * as THREE from 'three';
import { MindARThree } from 'mindar-image-three';

async function loadVideo(path) {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.src = path;
    video.setAttribute('crossorigin', 'anonymous');
    video.setAttribute('playsinline', '');
    video.loop = true;
    video.addEventListener('loadedmetadata', () => resolve(video));
    video.addEventListener('error', (err) => reject(err));
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  let backCameras = [];
  let currentCameraIndex = 0;
  let videoStream;
  let mindarThree;
  let videoElement;

  // گرفتن دوربین‌های عقب
  async function getBackCameras() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    backCameras = devices.filter(d => d.kind === "videoinput" && /back|rear|environment/i.test(d.label));
    if (backCameras.length === 0) backCameras = devices.filter(d => d.kind === "videoinput"); // fallback
  }

  // فعال کردن دوربین مشخص
  async function switchCamera(index) {
    if (videoStream) {
      videoStream.getTracks().forEach(track => track.stop());
    }

    const deviceId = backCameras[index].deviceId;
    videoStream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: deviceId }, width: 320, height: 240 }
    });

    // فقط MediaStream را به ویدئو AR بده
    if (mindarThree && mindarThree.videoElement) {
      mindarThree.videoElement.srcObject = videoStream;
      await mindarThree.videoElement.play();
    }
  }

  await getBackCameras();
  if (backCameras.length === 0) {
    alert("No cameras found!");
    return;
  }

  // ساخت MindAR
  mindarThree = new MindARThree({
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
      deviceId: { exact: backCameras[currentCameraIndex].deviceId },
      width: { ideal: 320, max: 320 },
      height: { ideal: 240, max: 240 }
    }
  });

  const { renderer, scene, camera } = mindarThree;

  videoElement = await loadVideo("./assets/videos/notopia.mp4");
  const texture = new THREE.VideoTexture(videoElement);

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
    videoElement.play();
  };
  anchor.onTargetLost = () => {
    isTracking = false;
    videoElement.pause();
  };

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

  // دکمه سوئیچ دوربین
  document.querySelector("#switch-camera").addEventListener("click", async () => {
    currentCameraIndex = (currentCameraIndex + 1) % backCameras.length;
    await switchCamera(currentCameraIndex);
  });
});
