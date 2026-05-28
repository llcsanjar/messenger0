import { initializeApp } from "firebase/app"
import { getAuth, GoogleAuthProvider } from "firebase/auth"

import {
  getMessaging,
  getToken,
  onMessage
} from "firebase/messaging"

import { API_URL } from "../config"

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
}

const app = initializeApp(firebaseConfig)

export const auth = getAuth(app)
export const provider = new GoogleAuthProvider()

// MESSAGING
export const messaging = getMessaging(app)

// TOKEN
export async function requestNotificationPermission() {

  const permission = await Notification.requestPermission()

  if (permission !== "granted") {
    console.log("Notification denied")
    return null
  }

  const token = await getToken(messaging, {
    vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY
  })

  await fetch(
    `${API_URL}/save-fcm-token`,
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json"
      },

      body: JSON.stringify({
        email: auth.currentUser.email,
        token: token
      })
    }
  )

  return token
}

// FOREGROUND MESSAGE
onMessage(messaging, (payload) => {

  console.log("Message received:", payload)

  const username = payload.data.title

  new Notification(
    "Messenger 0",
    {
      body: `Паёми нав аз тарафи ${username}`,
      icon: "/logo.png",
    }
  )

})