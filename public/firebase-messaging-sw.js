importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js")
importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js")

firebase.initializeApp({
    apiKey: "AIzaSyAjdcn4j-d8DjF62rNfpD3yLqma5rGcRYg",
    authDomain: "messenger0-1b3e9.firebaseapp.com",
    projectId: "messenger0-1b3e9",
    storageBucket: "messenger0-1b3e9.firebasestorage.app",
    messagingSenderId: "613278078220",
    appId: "1:613278078220:web:c20cf100955bf164eca529",
    measurementId: "G-KSDDYNFJDF"
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
