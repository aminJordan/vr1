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

  let currentDeviceId = null;
  let devices = [];

  async function requestCameraAccess(deviceId = null) {
    try {
      const constraints = {
        video: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          width: { ideal: 320 },
          height: { ideal: 240 }
        }
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      stream.getTracks().forEach(track => track.stop());
      return true;
    } catch (err) {
      alert("Camera access denied. AR cannot start.");
      console.error("Camera access error:", err);
      return false;
    }
  }

  async function getVideoDevices() {
    const allDevices = await navigator.mediaDevices.enumerateDevices();
    devices = allDevices.filter(d => d.kind === "videoinput");
  }

  await getVideoDevices();

  async function startAR(deviceId = null) {
    const hasAccess = await requestCameraAccess(deviceId);
    if (!hasAccess) return;

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
        width: { ideal: 320, max: 320 },
        height: { ideal: 240, max: 240 }
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

    return mindarThree;
  }

  let mindarInstance = await startAR();

  document.querySelector("#switch-camera").addEventListener("click", async () => {
    if (devices.length < 2) {
      alert("No other camera found.");
      return;
    }

    // پیدا کردن دستگاه بعدی
    const currentIndex = devices.findIndex(d => d.deviceId === currentDeviceId);
    const nextIndex = (currentIndex + 1) % devices.length;
    currentDeviceId = devices[nextIndex].deviceId;

    // متوقف کردن AR قبلی
    if (mindarInstance) {
      await mindarInstance.stop();
      mindarInstance.renderer.dispose();
    }

    // شروع مجدد AR با دوربین جدید
    mindarInstance = await startAR(currentDeviceId);
  });

});
