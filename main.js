// main.js

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

// --- تابع جدید برای پیدا کردن Device ID دوربین اصلی عقب ---
async function getMainBackCameraId() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    console.log("All devices:", devices); // برای اشکال‌زدایی

    // فیلتر کردن دستگاه‌های ویدیوی عقب
    const backCameras = devices.filter(device => device.kind === 'videoinput' && device.facing === 'environment');

    console.log("Back cameras found:", backCameras);

    if (backCameras.length > 0) {
      // فرض می‌کنیم اولین دوربین عقب، دوربین اصلی است.
      // اینجا می‌توانید منطق پیشرفته‌تریایی "اصلی‌ترین" دوربین اضافه کنید.
      // مثلاً بررسی label یا قابلیت‌هایی مثل resolution یا zoom.
      // برای سادگی، اولین یکی را انتخاب می‌کنیم.
      const mainBackCameraId = backCameras[0].deviceId;
      console.log("Selected main back camera ID:", mainBackCameraId);
      return mainBackCameraId;
    } else {
      console.warn("No back-facing camera found, returning null.");
      return null; // یا مقدار دیگری مانند 'environment'
    }
  } catch (err) {
    console.error("Error enumerating devices:", err);
    return null; // یا مقدار دیگری مانند 'environment'
  }
}
// --- پایان تابع جدید ---

document.addEventListener('DOMContentLoaded', async () => {

    // 1. ابتدا ID دوربین اصلی عقب را پیدا کنید
    const cameraId = await getMainBackCameraId();

    // --- تابع به‌روزرسانی‌شده برای بررسی دسترسی ---
    async function requestCameraAccess(cameraIdOrMode) {
      try {
        const constraints = {
          video: {}
        };

        if (cameraIdOrMode) {
             // اگر cameraId وجود داشت (یعنی null نبود)، از Device ID استفاده کن
             if (typeof cameraIdOrMode === 'string' && cameraIdOrMode !== 'environment') {
                 constraints.video.deviceId = { exact: cameraIdOrMode };
             } else if (cameraIdOrMode === 'environment') {
                 // اگر مقدار 'environment' بود، از facingMode استفاده کن
                 constraints.video.facingMode = 'environment';
             } else {
                 // اگر مقدار نامعتبری بود، از facingMode استفاده کن
                 constraints.video.facingMode = 'environment';
             }
        } else {
             // اگر cameraId null بود، از facingMode استفاده کن
             constraints.video.facingMode = 'environment';
        }

        // اضافه کردن سایزهای ایده‌آل
        constraints.video.width = { ideal: 320 };
        constraints.video.height = { ideal: 240 };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        stream.getTracks().forEach(track => track.stop());
        return true;
      } catch (err) {
        alert("Camera access denied. AR cannot start. Error: " + err.message);
        console.error("Camera access error:", err);
        return false;
      }
    }
    // --- پایان تابع به‌روزرسانی‌شده ---

    // 2. سپس از این ID یا مقدار برای بررسی دسترسی استفاده کنید
    const hasAccess = await requestCameraAccess(cameraId);
    if (!hasAccess) return;

    // 3. در نهایت، همان ID یا مقدار را در تنظیمات MindAR استفاده کنید
    const videoSettingsObj = {};
    if (cameraId) {
         if (typeof cameraId === 'string' && cameraId !== 'environment') {
             videoSettingsObj.deviceId = { exact: cameraId };
         } else {
             videoSettingsObj.facingMode = 'environment';
         }
    } else {
         // اگر cameraId null بود، به حالت facingMode برمی‌گردیم
         videoSettingsObj.facingMode = 'environment';
    }
    // اضافه کردن سایزهای ایده‌آل به videoSettingsObj
    videoSettingsObj.width = { ideal: 320, max: 320 };
    videoSettingsObj.height = { ideal: 240, max: 240 };

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
      videoSettings: videoSettingsObj // استفاده از شیء ساخته شده
    });

    // ... (بقیه کد شما، شامل loadVideo، ایجاد متریال، anchor و ... بدون تغییر باقی می‌ماند)
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
