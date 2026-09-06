import { createContext, useContext, useState, useEffect } from 'react';
import { translations, detectDeviceLanguage, saveLanguage } from './translations';

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(detectDeviceLanguage);

  const setLanguage = (newLang) => {
    if (translations[newLang]) {
      setLangState(newLang);
      saveLanguage(newLang);
    }
  };

  const t = translations[lang] || translations.en;

  return (
    <LanguageContext.Provider value={{ lang, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
