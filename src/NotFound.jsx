import { Link } from "react-router-dom"
import { getSavedLanguage, getTranslation } from "./translations"
import "./NotFound.css"

function NotFound() {
  const lang = getSavedLanguage()
  const t = getTranslation(lang)

  // Determine RTL support
  const isRtl = lang === "fa"

  return (
    <div className="not-found-container" style={{ direction: isRtl ? "rtl" : "ltr" }}>
      <div className="not-found-glass">
        <h1 className="not-found-code">404</h1>
        <p className="not-found-text">{t.page_not_found || "Саҳифа ёфт нашуд"}</p>
        <Link to="/" className="not-found-button">
          {t.go_back_home || "Бозгашт ба саҳифаи асосӣ"}
        </Link>
      </div>
      <div className="glow-circle-1"></div>
      <div className="glow-circle-2"></div>
    </div>
  )
}

export default NotFound
