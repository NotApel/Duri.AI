import { apiRequest } from "./api";
const pushRequest = (path, options = {}) =>
  apiRequest(path, { ...options, signal: AbortSignal.timeout(15000) });
import { readyRegistration, setPushAccount } from "./pwa";
export const supportsPush = () =>
  window.isSecureContext &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window;
export async function endpointHash(endpoint) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(endpoint),
  );
  return Array.from(new Uint8Array(bytes), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
}
function publicBytes(value) {
  const text = value.replaceAll("-", "+").replaceAll("_", "/");
  return Uint8Array.from(
    atob(text + "=".repeat((4 - (text.length % 4)) % 4)),
    (char) => char.charCodeAt(0),
  );
}
export async function pushState() {
  if (!supportsPush())
    return {
      supported: false,
      permission: "unsupported",
      subscribed: false,
      enabled: false,
    };
  const config = await pushRequest("/push/public-key");
  const registration = await readyRegistration();
  const subscription = await registration.pushManager.getSubscription();
  const result = await pushRequest("/push/subscriptions");
  const hash = subscription ? await endpointHash(subscription.endpoint) : null;
  return {
    supported: true,
    permission: Notification.permission,
    enabled: config.enabled,
    subscribed:
      Notification.permission === "granted" &&
      result.subscriptions.some(
        (row) =>
          row.endpoint_hash === hash &&
          row.vapid_public_key === config.public_key,
      ),
    publicKey: config.public_key,
  };
}
export async function enablePush(farmerId) {
  const expectedToken = localStorage.getItem("token");
  const sameAccount = () => {
    if (!expectedToken || localStorage.getItem("token") !== expectedToken)
      throw new Error(
        "Your account changed. Reopen notification settings before enabling alerts.",
      );
  };
  sameAccount();
  if (!supportsPush())
    throw new Error(
      "Notifications need HTTPS or localhost and a supported browser.",
    );
  // Ask inside the button action before network waits so browsers retain the user gesture.
  const permission =
    Notification.permission === "default"
      ? await Notification.requestPermission()
      : Notification.permission;
  if (permission !== "granted")
    throw new Error(
      "Notifications are blocked. Allow them in your browser site settings, then try again.",
    );
  const config = await pushRequest("/push/public-key");
  if (!config.enabled || !config.public_key)
    throw new Error("Push notifications are not configured on the backend.");
  const registration = await readyRegistration();
  let subscription = await registration.pushManager.getSubscription();
  const currentKey = subscription?.options?.applicationServerKey;
  const expected = publicBytes(config.public_key);
  if (
    subscription &&
    (!currentKey ||
      Array.from(new Uint8Array(currentKey)).join(",") !==
        Array.from(expected).join(","))
  ) {
    if (!(await subscription.unsubscribe()))
      throw new Error(
        "The old browser subscription could not be replaced. Please try again.",
      );
    subscription = null;
  }
  subscription ||= await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: expected,
  });
  try {
    sameAccount();
    await pushRequest("/push/subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subscription: subscription.toJSON(),
        vapid_public_key: config.public_key,
      }),
    });
    sameAccount();
    await setPushAccount(farmerId, expectedToken);
  } catch (error) {
    await pushRequest("/push/subscriptions", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint_hash: await endpointHash(subscription.endpoint),
      }),
    }).catch(() => {});
    await subscription.unsubscribe().catch(() => {});
    throw error;
  }
  return pushState();
}
export async function disablePush() {
  const registration = await readyRegistration();
  const subscription = await registration.pushManager.getSubscription();
  if (subscription) {
    await pushRequest("/push/subscriptions", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint_hash: await endpointHash(subscription.endpoint),
      }),
    });
    if (!(await subscription.unsubscribe()))
      throw new Error(
        "Server alerts are disabled, but the browser subscription could not be removed. Retry disabling it.",
      );
  }
  await setPushAccount(null);
  return pushState();
}
