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

// --- تابع جدید برای پیدا کردن Device ID دوربین اصلی عقب با بررسی قابلیت‌ها ---
async function getMainBackCameraId() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    console.log("All devices:", devices); // برای اشکال‌زدایی

    // فیلتر کردن دستگاه‌های ویدیوی عقب
    const backCameras = devices.filter(device => device.kind === 'videoinput' && device.facing === 'environment');

    console.log("Back cameras found:", backCameras);

    if (backCameras.length === 0) {
      console.warn("No back-facing camera found.");
      return null;
    }

    if (backCameras.length === 1) {
      console.log("Only one back camera available, selecting it:", backCameras[0].deviceId);
      return backCameras[0].deviceId;
    }

    // آرایه‌ای برای ذخیره اطلاعات قابلیت‌های هر دوربین همراه با deviceId
    const cameraCapabilities = [];

    for (const camera of backCameras) {
      try {
        // دریافت یک جریان کوچک برای دسترسی به Track و قابلیت‌های آن
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: camera.deviceId,
            width: { ideal: 320 }, // حداقل ممکن برای تست سریع
            height: { ideal: 240 }
          }
        });

        const videoTrack = stream.getVideoTracks()[0];
        // const capabilities = videoTrack.getCapabilities(); // این قسمت در بعضی مرورگرها کار نمی‌کند یا اطلاعات محدودی می‌دهد
        // console.log(`Capabilities for ${camera.label || camera.deviceId}:`, capabilities);

        // بدست آوردن اطلاعات واقعی از Track
        const settings = videoTrack.getSettings();
        const constraints = videoTrack.getConstraints();

        // اطلاعات اساسی را ذخیره می‌کنیم
        cameraCapabilities.push({
          deviceId: camera.deviceId,
          label: camera.label || `Camera-${camera.deviceId.slice(0, 5)}`, // اگر label نباشد، از قسمتی از deviceId استفاده می‌کنیم
          width: settings.width || 0,
          height: settings.height || 0,
          frameRate: settings.frameRate || 0,
          maxWidth: constraints.width ? (constraints.width.max || 0) : 0,
          maxHeight: constraints.height ? (constraints.height.max || 0) : 0,
          maxFrameRate: constraints.frameRate ? (constraints.frameRate.max || 0) : 0,
        });

        // جریان را متوقف می‌کنیم
        videoTrack.stop();
      } catch (trackErr) {
        console.warn(`Could not get capabilities for camera ${camera.deviceId} (${camera.label}):`, trackErr);
        // اگر نتوانستیم قابلیت‌ها را بگیریم، باز هم اطلاعات پایه را اضافه می‌کنیم
        cameraCapabilities.push({
          deviceId: camera.deviceId,
          label: camera.label || `Camera-${camera.deviceId.slice(0, 5)}`,
          width: 0,
          height: 0,
          frameRate: 0,
          maxWidth: 0,
          maxHeight: 0,
          maxFrameRate: 0,
        });
      }
    }

    console.log("Back camera capabilities analyzed:", cameraCapabilities);

    // مرتب‌سازی بر اساس معیارهایی که ممکن است دوربین اصلی را نشان دهد
    // 1. اولویت اصلی: حداکثر ارتفاع (Max Height) - معمولاً بالاترین رزولوشن
    // 2. اگر مساوی بود، حداکثر عرض (Max Width)
    // 3. اگر مساوی بود، ارتفاع تنظیمات فعلی (Height)
    // 4. اگر مساوی بود، عرض تنظیمات فعلی (Width)
    // 5. اگر مساوی بود، حداکثر نرخ فریم (Max FrameRate)
    // 6. اگر مساوی بود، نرخ فریم تنظیمات فعلی (FrameRate)
    cameraCapabilities.sort((a, b) => {
      // مرتب‌سازی نزولی (Descending)
      if (b.maxHeight !== a.maxHeight) return b.maxHeight - a.maxHeight;
      if (b.maxWidth !== a.maxWidth) return b.maxWidth - a.maxWidth;
      if (b.height !== a.height) return b.height - a.height;
      if (b.width !== a.width) return b.width - a.width;
      if (b.maxFrameRate !== a.maxFrameRate) return b.maxFrameRate - a.maxFrameRate;
      if (b.frameRate !== a.frameRate) return b.frameRate - a.frameRate;
      // اگر همه چیز مساوی بود، ترتیب ثابت می‌ماند
      return 0;
    });

    console.log("Sorted camera capabilities (most likely main first):", cameraCapabilities);

    // اولین دوربین در لیست مرتب‌شده، احتمالاً دوربین اصلی است
    const mainCameraInfo = cameraCapabilities[0];
    console.log(`Selected main back camera based on capabilities: ${mainCameraInfo.label} (ID: ${mainCameraInfo.deviceId})`);
    return mainCameraInfo.deviceId;

  } catch (err) {
    console.error("Error analyzing back camera capabilities:", err);
    return null; // در صورت خطا، null برگردانده می‌شود و سپس از 'environment' استفاده می‌کنیم
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
             if (typeof cameraIdOrMode === 'string' && cameraIdOrMode !== 'environment') {
                 constraints.video.deviceId = { exact: cameraIdOrMode };
             } else if (cameraIdOrMode === 'environment') {
                 constraints.video.facingMode = 'environment';
             } else {
                 constraints.video.facingMode = 'environment';
             }
        } else {
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
