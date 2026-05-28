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

import './App.css'

function App() {

  const [user, setUser] = useState(undefined)

  useEffect(() => {

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {

      setUser(currentUser)

    })

    return () => unsubscribe()

  }, [])

  // Loading state
  if (user === undefined) {
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

    </BrowserRouter>
  )
}

export default App