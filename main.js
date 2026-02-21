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

  async function requestCameraAccess() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 }
        }
      });
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
      width: { ideal: 640 },
      height: { ideal: 480 }
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
