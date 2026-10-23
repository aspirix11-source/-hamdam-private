self.addEventListener("push", event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch {}
  const title = data.title || "Hamdam";
  const options = {
    body: data.body || "You have a new notification",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: data.tag || "hamdam-notification",
    data: { url: data.url || "/", type: data.type || "message", conversationId: data.conversationId || "" },
    renotify: true,
    requireInteraction: data.type === "call"
  };
  event.waitUntil(self.registration.showNotification(title, options));
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = event.notification.data && event.notification.data.url || "/";
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const client of list) {
      if ("focus" in client) { client.navigate(target); return client.focus(); }
    }
    return clients.openWindow ? clients.openWindow(target) : undefined;
  }));
});
