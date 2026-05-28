// i18n.js
import { getSavedLanguage, saveLanguage, translate } from './translations';

// Забонҳои дастгиришаванда
export const SUPPORTED_LANGUAGES = {
  tg: { code: 'tg', name: 'Тоҷикӣ', dir: 'ltr' },
  ru: { code: 'ru', name: 'Русский', dir: 'ltr' },
  en: { code: 'en', name: 'English', dir: 'ltr' },
  fa: { code: 'fa', name: 'فارسی', dir: 'rtl' }
};

// Функсияи гирифтани забони браузер
export const getBrowserLanguage = () => {
  const browserLang = navigator.language || navigator.userLanguage;
  
  // Тафтиши забони браузер
  if (browserLang.startsWith('tg')) return 'tg';
  if (browserLang.startsWith('ru')) return 'ru';
  if (browserLang.startsWith('en')) return 'en';
  if (browserLang.startsWith('fa')) return 'fa';
  
  // Забони пешфарз
  return 'tg';
};

// Функсияи гирифтани забони фаъол
export const getActiveLanguage = () => {
  const saved = getSavedLanguage();
  // Агар забони сабтшуда дастгирӣ шавад, онро баргардон
  if (SUPPORTED_LANGUAGES[saved]) return saved;
  
  // Агар не, забони браузерро санҷед
  const browserLang = getBrowserLanguage();
  if (SUPPORTED_LANGUAGES[browserLang]) return browserLang;
  
  // Забони пешфарз
  return 'tg';
};

// Функсияи иваз кардани забон
export const changeLanguage = (langCode, setLanguage, setTranslations) => {
  if (SUPPORTED_LANGUAGES[langCode]) {
    saveLanguage(langCode);
    setLanguage(langCode);
    setTranslations(translate(langCode));
    
    // Тағйир додани direction барои забонҳои RTL (масалан форсӣ)
    const htmlElement = document.documentElement;
    if (SUPPORTED_LANGUAGES[langCode].dir === 'rtl') {
      htmlElement.setAttribute('dir', 'rtl');
      htmlElement.style.direction = 'rtl';
    } else {
      htmlElement.setAttribute('dir', 'ltr');
      htmlElement.style.direction = 'ltr';
    }
  }
};

// Hook барои истифода дар компонентҳо
export const useLanguage = () => {
  const [language, setLanguage] = useState(getActiveLanguage());
  const [translations, setTranslations] = useState(() => translate(language));
  
  useEffect(() => {
    setTranslations(translate(language));
    
    // Тағйир додани direction
    const dir = SUPPORTED_LANGUAGES[language]?.dir || 'ltr';
    document.documentElement.setAttribute('dir', dir);
    document.documentElement.style.direction = dir;
  }, [language]);
  
  const changeLang = (langCode) => {
    changeLanguage(langCode, setLanguage, setTranslations);
  };
  
  return { language, translations, changeLang, t: translations };
};

// Import useEffect ва useState
import { useState, useEffect } from 'react';