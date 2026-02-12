import * as THREE from 'three';
import { MindARThree } from 'mindar-image-three';

document.addEventListener('DOMContentLoaded', async () => {

  // تابع برای گرفتن دسترسی دوربین
  async function requestCameraAccess() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      // وقتی اجازه داده شد، همه چیز بسته میشه (می‌خوایم فقط اجازه بگیریم)
      stream.getTracks().forEach(track => track.stop());
      return true;
    } catch (err) {
      alert("Camera access denied. AR cannot start.");
      console.error("Camera access error:", err);
      return false;
    }
  }

  const hasAccess = await requestCameraAccess();
  if (!hasAccess) return; // اگر اجازه داده نشد، AR اجرا نمی‌شود

  // شروع AR بعد از گرفتن دسترسی
  const mindarThree = new MindARThree({
    container: document.body,
    imageTargetSrc: './assets/targets/notopia.mind',
    maxTrack: 1,
    uiLoading: "yes",
    uiError: "yes",
    uiScanning: "yes"
  });

  const { renderer, scene, camera } = mindarThree;

  // یک plane ساده برای تست
  const geometry = new THREE.PlaneGeometry(1, 1);
  const material = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.5 });
  const plane = new THREE.Mesh(geometry, material);

  const anchor = mindarThree.addAnchor(0);
  anchor.group.add(plane);

  try {
    await mindarThree.start();
    renderer.setAnimationLoop(() => {
      renderer.render(scene, camera);
    });
  } catch (err) {
    console.error("AR start failed:", err);
    alert("Cannot start AR. Make sure camera permission is allowed and browser supports WebXR/WebAR.");
  }

});
