import React, { createContext, useEffect, useState, useContext, ReactNode } from 'react';

export type Language = "zh" | "en";

const SUPPORTED_LANGUAGES: Language[] = ["zh", "en"];

const fallbackTranslations: Record<Language, Record<string, any>> = {
  zh: {},
  en: {},
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: Record<string, any>;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [loadedTranslations, setLoadedTranslations] = useState<Record<Language, Record<string, any>>>(fallbackTranslations);
  const [language, setLanguageState] = useState<Language>(() => {
    // Try to get language from localStorage
    const saved = localStorage.getItem('app_language');
    // Check if saved language is valid
    if (saved && SUPPORTED_LANGUAGES.includes(saved as Language)) {
      return saved as Language;
    }
    return 'zh'; // Default to zh (Simplified Chinese)
  });

  useEffect(() => {
    let isMounted = true;

    import('./translations')
      .then((mod) => {
        if (isMounted) {
          setLoadedTranslations(mod.translations as Record<Language, Record<string, any>>);
        }
      })
      .catch(() => {
        if (isMounted) {
          setLoadedTranslations(fallbackTranslations);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('app_language', lang);
  };

  const value = {
    language,
    setLanguage,
    t: loadedTranslations[language] || fallbackTranslations[language],
  };

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};