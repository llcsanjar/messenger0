import { useState, useEffect } from 'react'
import './Register.css'

import { auth, provider } from './firebase'
import { API_URL } from "../config"

import {
  signInWithRedirect
} from 'firebase/auth'

import { useNavigate } from 'react-router-dom'

import { generateKeys } from './crypto'
import { translate, getSavedLanguage, getBrowserLanguage, saveLanguage } from '../translations'

function Register() {

  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(false)
  const [language, setLanguage] = useState('tg')
  const [t, setT] = useState({})
  const [showLangMenu, setShowLangMenu] = useState(false)

  const navigate = useNavigate()

  // Забонҳои дастгиришаванда
  const languages = {
    tg: { name: 'Тоҷикӣ', code: 'tg' },
    ru: { name: 'Русский', code: 'ru' },
    en: { name: 'English', code: 'en' },
    fa: { name: 'فارسی', code: 'fa' }
  }

  // Функсияи гирифтани забони браузер
  const getBrowserLang = () => {
    const browserLang = navigator.language || navigator.userLanguage
    
    if (browserLang.startsWith('tg')) return 'tg'
    if (browserLang.startsWith('ru')) return 'ru'
    if (browserLang.startsWith('en')) return 'en'
    if (browserLang.startsWith('fa')) return 'fa'
    
    return 'tg' // забони пешфарз
  }

  // Боргирии забон дар аввал
  useEffect(() => {
    // Агар забони сабтшуда мавҷуд бошад, онро истифода барем
    let savedLang = getSavedLanguage()
    
    // Агар забони сабтшуда вуҷуд надошта бошад, забони браузерро гирем
    if (!savedLang || !languages[savedLang]) {
      savedLang = getBrowserLang()
      saveLanguage(savedLang)
    }
    
    setLanguage(savedLang)
    setT(translate(savedLang))
    
    // Тағйир додани direction барои забонҳои RTL
    if (savedLang === 'fa') {
      document.documentElement.setAttribute('dir', 'rtl')
      document.documentElement.style.direction = 'rtl'
    } else {
      document.documentElement.setAttribute('dir', 'ltr')
      document.documentElement.style.direction = 'ltr'
    }
  }, [])

  // Функсияи иваз кардани забон
  const changeLanguage = (langCode) => {
    setLanguage(langCode)
    setT(translate(langCode))
    saveLanguage(langCode)
    setShowLangMenu(false)
    
    // Тағйир додани direction барои забонҳои RTL
    if (langCode === 'fa') {
      document.documentElement.setAttribute('dir', 'rtl')
      document.documentElement.style.direction = 'rtl'
    } else {
      document.documentElement.setAttribute('dir', 'ltr')
      document.documentElement.style.direction = 'ltr'
    }
  }

  const loginWithGoogle = async () => {
    try {
      setLoading(true)

      // Google Login
      const result = await signInWithRedirect(
        auth,
        provider
      )

      // User Data
      const userData = {
        name: result.user.displayName,
        email: result.user.email,
        photo: result.user.photoURL,
      }

      // Check if email already exists in DB when they don't have keys
      const hasKeys = localStorage.getItem("public_key") && localStorage.getItem("private_key")
      if (!hasKeys) {
        const checkRes = await fetch(`${API_URL}/find-user/${result.user.email}`)
        const checkData = await checkRes.json()
        if (checkData && checkData.email) {
          if (!window.isEmailAlertShown) {
            window.isEmailAlertShown = true
            const alerts = {
              tg: "Ин почтаи электронӣ аллакай аз ҷониби корбари дигар сабт шудааст!",
              ru: "Этот email уже зарегистрирован другим пользователем!",
              en: "This email is already registered by another user!",
              fa: "این ایمیل قبلاً توسط کاربر دیگری ثبت شده است!"
            }
            alert(alerts[language] || alerts.tg)
            setTimeout(() => {
              window.isEmailAlertShown = false
            }, 2000)
          }
          await auth.signOut()
          return
        }
      }

      // Save user state
      setUser(userData)

      // Generate E2EE keys
      await generateKeys()

      const pubKey = localStorage.getItem("public_key")

      // Send to backend
      const response = await fetch(
        `${API_URL}/register`,
        {
          method: 'POST',

          headers: {
            'Content-Type': 'application/json',
          },

          body: JSON.stringify({
            name: userData.name,
            email: userData.email,
            photo: userData.photo,
            public_key: pubKey,
          }),
        }
      )

      // Get backend result
      const data = await response.json()

      console.log(data)

      // Redirect ONLY if success
      if (response.ok) {

        navigate('/dashboard', {
          state: userData
        })

      } else {

        console.log('Backend error')

      }

    } catch (error) {

      console.log(error)

    } finally {

      setLoading(false)

    }
  }

  // Тарҷумаҳо барои саҳифаи сабти ном
  const registerTranslations = {
    tg: {
      title: "Messenger 0",
      description: "Платформаи муосири паёмрасонӣ бо системаи амниятии E2EE.",
      securityTitle: "Амнияти пурра",
      securityItems: [
        "End-to-End Encryption (E2EE)",
        "Ҳеҷ кас паёмҳои шуморо хонда наметавонад",
        "Паёмҳо танҳо дар дастгоҳҳои шумо кушода мешаванд",
        "Ҳатто администраторҳо дастрасӣ надоранд",
        "Калидҳои рамзгузорӣ танҳо дар дастгоҳи шумо нигоҳ дошта мешаванд",
        "Муҳофизат аз дуздии аккаунт",
        "Муҳофизати пурраи маълумоти шахсӣ",
        "Амнияти баланд барои чатҳо ва файлҳо",
        "Сабти ном тавассути Google Authentication"
      ],
      loginButton: "Сабти ном бо Google",
      connecting: "Connecting...",
      changeLanguage: "Забон"
    },
    ru: {
      title: "Messenger 0",
      description: "Современная платформа для обмена сообщениями с системой безопасности E2EE.",
      securityTitle: "Полная безопасность",
      securityItems: [
        "End-to-End Encryption (E2EE)",
        "Никто не может прочитать ваши сообщения",
        "Сообщения расшифровываются только на ваших устройствах",
        "Даже администраторы не имеют доступа",
        "Ключи шифрования хранятся только на вашем устройстве",
        "Защита от кражи аккаунта",
        "Полная защита личной информации",
        "Высокая безопасность для чатов и файлов",
        "Вход через Google Authentication"
      ],
      loginButton: "Регистрация через Google",
      connecting: "Connecting...",
      changeLanguage: "Язык"
    },
    en: {
      title: "Messenger 0",
      description: "Modern messaging platform with E2EE security system.",
      securityTitle: "Complete Security",
      securityItems: [
        "End-to-End Encryption (E2EE)",
        "No one can read your messages",
        "Messages are only decrypted on your devices",
        "Even administrators have no access",
        "Encryption keys are stored only on your device",
        "Account theft protection",
        "Complete personal data protection",
        "High security for chats and files",
        "Login via Google Authentication"
      ],
      loginButton: "Register with Google",
      connecting: "Connecting...",
      changeLanguage: "Language"
    },
    fa: {
      title: "پیام‌رسان ۰",
      description: "پلتفرم مدرن پیام‌رسانی با سیستم امنیتی E2EE",
      securityTitle: "امنیت کامل",
      securityItems: [
        "رمزگذاری سرتاسری (E2EE)",
        "هیچ کس نمی‌تواند پیام‌های شما را بخواند",
        "پیام‌ها فقط در دستگاه‌های شما باز می‌شوند",
        "حتی مدیران دسترسی ندارند",
        "کلیدهای رمزگذاری فقط در دستگاه شما ذخیره می‌شوند",
        "محافظت در برابر سرقت حساب",
        "محافظت کامل از اطلاعات شخصی",
        "امنیت بالا برای چت‌ها و فایل‌ها",
        "ورود از طریق احراز هویت گوگل"
      ],
      loginButton: "ثبت نام با گوگل",
      connecting: "در حال اتصال...",
      changeLanguage: "زبان"
    }
  }

  const currentT = registerTranslations[language] || registerTranslations.tg

  return (
    <div className="register">

      {/* Тугмаи тағйири забон */}
      <div className="language-selector-container">
        <button 
          className="language-toggle-btn"
          onClick={() => setShowLangMenu(!showLangMenu)}
        >
          <span>🌐</span>
          <span>{languages[language].name}</span>
        </button>
        
        {showLangMenu && (
          <div className="language-menu">
            {Object.entries(languages).map(([code, lang]) => (
              <button
                key={code}
                className={`language-option ${language === code ? 'active' : ''}`}
                onClick={() => changeLanguage(code)}
              >
                {lang.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="register-card">

        <img
          src="/logo.png"
          alt="logo"
          className="logo"
        />

        <h1>{currentT.title}</h1>

        <p className="description">
          {currentT.description}
        </p>

        <div className="security-box">

          <h3>
            {currentT.securityTitle}
          </h3>

          <ul>
            {currentT.securityItems.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>

        </div>

        <button
          onClick={loginWithGoogle}
          disabled={loading}
        >

          {loading ? currentT.connecting : currentT.loginButton}

        </button>

      </div>

      {user && (
        <div className="profile">

          <img
            src={user.photo}
            alt=""
          />

          <h2>
            {user.name}
          </h2>

          <p>
            {user.email}
          </p>

        </div>
      )}

    </div>
  )
}

export default Register