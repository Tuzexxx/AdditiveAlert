// Unique anonymous device identifier helper
export function getDeviceId() {
  let deviceId = localStorage.getItem('additivealert_device_id');
  if (!deviceId) {
    // Generate a secure UUID v4
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      deviceId = crypto.randomUUID();
    } else {
      deviceId = 'dev_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
    }
    localStorage.setItem('additivealert_device_id', deviceId);
  }
  return deviceId;
}
