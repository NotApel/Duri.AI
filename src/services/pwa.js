let registrationPromise;
export function registerPWA() {
  if (!window.isSecureContext || !("serviceWorker" in navigator))
    return Promise.resolve(null);
  registrationPromise ||= navigator.serviceWorker
    .register("/sw.js", { scope: "/", updateViaCache: "none" })
    .catch((error) => {
      registrationPromise = undefined;
      throw error;
    });
  return registrationPromise;
}
export async function readyRegistration() {
  const registration = await registerPWA();
  if (!registration)
    throw new Error(
      "Notifications need HTTPS or localhost and a supported browser.",
    );
  let timer;
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                "The notification service is not ready. Reload and try again.",
              ),
            ),
          10000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
export async function setPushAccount(farmerId, expectedToken) {
  if (!window.isSecureContext || !("serviceWorker" in navigator)) return;
  const registration = await readyRegistration();
  if (expectedToken && localStorage.getItem("token") !== expectedToken)
    throw new Error("Your account changed while enabling notifications.");
  const channel = new MessageChannel();
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      channel.port1.close();
      reject(new Error("The notification account could not be updated."));
    }, 5000);
    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      channel.port1.close();
      event.data?.ok
        ? resolve()
        : reject(new Error("The notification account could not be saved."));
    };
    registration.active.postMessage(
      { type: "PUSH_ACCOUNT", farmerId: farmerId ? String(farmerId) : null },
      [channel.port2],
    );
  });
}
export async function clearLocalPush() {
  await setPushAccount(null).catch(() => {});
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager?.getSubscription();
  await subscription?.unsubscribe();
}
