importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js")
importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js")

firebase.initializeApp({
    apiKey: "AIzaSyBEfyEUvDNqlrNj5He4joklzMSwjITxwKE",
    authDomain: "messanger-0.firebaseapp.com",
    projectId: "messanger-0",
    storageBucket: "messanger-0.firebasestorage.app",
    messagingSenderId: "321068488797",
    appId: "1:321068488797:web:6d6eabc2584ecc5e6155b4",
    measurementId: "G-JWPG5WXY0K"
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
