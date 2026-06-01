import {
  BrowserRouter,
  Routes,
  Route,
  Navigate
} from "react-router-dom"

import {
  useEffect,
  useState
} from "react"

import {
  onAuthStateChanged
} from "firebase/auth"

import { auth } from "./registration/firebase"

import Register from "./registration/Register"
import Dashboard from "./dashboard/Dashboard"
import NotFound from "./NotFound"
import AccountTransfer from "./registration/AccountTransfer"
import { API_URL } from "./config"
import { getSavedLanguage, getTranslation } from "./translations"

import './App.css'

function App() {

  const [user, setUser] = useState(undefined)
  const [showTransferModal, setShowTransferModal] = useState(false)
  const [pendingEmail, setPendingEmail] = useState(null)
  const [pendingUser, setPendingUser] = useState(null)

  useEffect(() => {

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {

      if (currentUser) {
        const hasKeys = localStorage.getItem("public_key") && localStorage.getItem("private_key")
        
        if (!hasKeys) {
          try {
            const response = await fetch(`${API_URL}/find-user/${currentUser.email}`)
            const data = await response.json()
            
            if (data && data.email) {
              setPendingEmail(currentUser.email)
              setPendingUser(currentUser)
              setShowTransferModal(true)
              return
            }
          } catch (err) {
            console.error("Error checking user registration:", err)
          }
        }
      }

      setUser(currentUser)

    })

    return () => unsubscribe()

  }, [])

  const handleTransferSuccess = async (keys) => {
    setShowTransferModal(false)
    
    if (pendingUser) {
      setUser(pendingUser)
    }
  }

  const handleTransferCancel = () => {
    setShowTransferModal(false)
    setUser(null)
    auth.signOut()
  }

  const currentLanguage = getSavedLanguage()
  const t = getTranslation(currentLanguage)

  if (user === undefined && !showTransferModal) {
    return (
      <div className="loading">
        <img src="/logo.png" alt="logo" />
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={
            user
              ? <Navigate to="/dashboard" replace />
              : <Navigate to="/register" replace />
          }
        />

        <Route
          path="/register"
          element={
            user
              ? <Navigate to="/dashboard" replace />
              : <Register />
          }
        />

        <Route
          path="/dashboard"
          element={
            user
              ? <Dashboard />
              : <Navigate to="/register" replace />
          }
        />

        <Route
          path="/messages/:email_name"
          element={
            user
              ? <Dashboard />
              : <Navigate to="/register" replace />
          }
        />

        <Route path="*" element={<NotFound />} />
      </Routes>

      {showTransferModal && (
        <AccountTransfer
          email={pendingEmail}
          onSuccess={handleTransferSuccess}
          onCancel={handleTransferCancel}
          t={t}
        />
      )}
    </BrowserRouter>
  )
}

export default App