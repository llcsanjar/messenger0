importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js")
importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js")

firebase.initializeApp({
    apiKey: "__VITE_FIREBASE_API_KEY__",
    authDomain: "__VITE_FIREBASE_AUTH_DOMAIN__",
    projectId: "__VITE_FIREBASE_PROJECT_ID__",
    storageBucket: "__VITE_FIREBASE_STORAGE_BUCKET__",
    messagingSenderId: "__VITE_FIREBASE_MESSAGING_SENDER_ID__",
    appId: "__VITE_FIREBASE_APP_ID__",
    measurementId: "__VITE_FIREBASE_MEASUREMENT_ID__"
})

const messaging = firebase.messaging()

messaging.onBackgroundMessage((payload) => {

    console.log(payload)

    const title = payload.data.title || "Messenger 0"
    const body = payload.data.body || ""
    const type = payload.data.type || "chat"

    self.registration.showNotification(
        title,
        {
            body: body,
            icon: "/logo.png",
            tag: type === "call" ? "incoming-call" : undefined,
            renotify: type === "call"
        }
    )
})

self.addEventListener("notificationclick", (event) => {
    event.notification.close()

    event.waitUntil(
        clients.openWindow("/")
    )
})

self.addEventListener("install", (event) => {
    self.skipWaiting()
})

self.addEventListener("activate", (event) => {
    event.waitUntil(clients.claim())
})
