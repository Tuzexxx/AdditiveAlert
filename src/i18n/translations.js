export const translations = {
  cs: {
    appTitle: 'AdditiveAlert',
    appSubtitle: 'Mějte přehled o tom, co jíte. Okamžitá analýza přísad a Éček.',
    placeholder: 'Vložte složení nebo vyfoťte etiketu na obalu... (např. Voda, cukr, E250, dusitan sodný, kyselina citronová, E331, E450)',
    scanPhoto: 'Vyfotit obal',
    analyze: 'Analyzovat',
    analyzing: 'Analyzuji složení pomocí AI...',
    resultsHeader: 'Nalezená aditiva',
    foundCount: 'nalezeno',
    noAdditivesFound: 'Ve složení nebyla nalezena žádná riziková aditiva ani Éčka.',
    riskLevels: {
      1: 'Neškodné / Přírodní',
      2: 'Nízké riziko',
      3: 'Střední riziko (s mírou)',
      4: 'Vyšší riziko / Alergeny',
      5: 'Vysoké riziko / Karcinogeny',
    },
    riskScore: 'Úroveň rizika',
    ferpotravinaScore: 'Fér Potravina',
    originalText: 'Text z obalu',
    category: 'Kategorie',
    whyCare: 'Dopad na zdraví',
    navHome: 'Domů',
    navHistory: 'Historie',
    navLogin: 'Přihlásit se',
    navLogout: 'Odhlásit se',
    navAdmin: 'Administrace',
    scanSaved: 'Uloženo do historie',
    errorScan: 'Analýza se nezdařila. Zkontrolujte připojení nebo zkuste čitelnější fotku.',
    offlineNotice: 'Offline režim: Používá se lokální databáze 402 aditiv.',
    aiNotice: 'AI Vision: Přesná detekce odstavce složení.',
    langName: 'Jazyk / Language',
  },
  en: {
    appTitle: 'AdditiveAlert',
    appSubtitle: 'Know what is in your food. Instant additive and E-number analysis.',
    placeholder: 'Paste ingredients or snap a photo of the label... (e.g. Water, sugar, E250, sodium nitrite, citric acid, E331, E450)',
    scanPhoto: 'Scan Photo',
    analyze: 'Analyze',
    analyzing: 'Analyzing ingredients with AI...',
    resultsHeader: 'Detected Additives',
    foundCount: 'found',
    noAdditivesFound: 'No harmful additives or E-numbers detected in ingredients.',
    riskLevels: {
      1: 'Harmless / Natural',
      2: 'Low Risk',
      3: 'Moderate Risk (in moderation)',
      4: 'Elevated Risk / Allergens',
      5: 'High Risk / Carcinogenic concerns',
    },
    riskScore: 'Risk Level',
    ferpotravinaScore: 'Fér Potravina',
    originalText: 'Label Text',
    category: 'Category',
    whyCare: 'Health Impact',
    navHome: 'Home',
    navHistory: 'History',
    navLogin: 'Login',
    navLogout: 'Logout',
    navAdmin: 'Admin',
    scanSaved: 'Saved to history',
    errorScan: 'Analysis failed. Please check connection or try a clearer image.',
    offlineNotice: 'Offline Mode: Using local database of 402 additives.',
    aiNotice: 'AI Vision: Precise ingredients section detection.',
    langName: 'Language',
  },
  de: {
    appTitle: 'AdditiveAlert',
    appSubtitle: 'Wissen, was im Essen steckt. Sofortige Analyse von Zusatzstoffen und E-Nummern.',
    placeholder: 'Zutaten einfügen oder Etikett fotografieren... (z. B. Wasser, Zucker, E250, Natriumnitrit, Zitronensäure, E331, E450)',
    scanPhoto: 'Foto scannen',
    analyze: 'Analysieren',
    analyzing: 'Zutaten werden mit KI analysiert...',
    resultsHeader: 'Erkannte Zusatzstoffe',
    foundCount: 'gefunden',
    noAdditivesFound: 'Keine bedenklichen Zusatzstoffe oder E-Nummern gefunden.',
    riskLevels: {
      1: 'Unbedenklich / Natürlich',
      2: 'Geringes Risiko',
      3: 'Mäßiges Risiko (in Maßen)',
      4: 'Erhöhtes Risiko / Allergene',
      5: 'Hohes Risiko / Bedenklich',
    },
    riskScore: 'Risikostufe',
    ferpotravinaScore: 'Fér Potravina',
    originalText: 'Etikettentext',
    category: 'Kategorie',
    whyCare: 'Auswirkungen auf die Gesundheit',
    navHome: 'Startseite',
    navHistory: 'Verlauf',
    navLogin: 'Anmelden',
    navLogout: 'Abmelden',
    navAdmin: 'Verwaltung',
    scanSaved: 'Im Verlauf gespeichert',
    errorScan: 'Analyse fehlgeschlagen. Bitte Verbindung oder Fotoqualität prüfen.',
    offlineNotice: 'Offline-Modus: Verwendet lokale Datenbank mit 402 Zusatzstoffen.',
    aiNotice: 'KI-Vision: Präzise Erkennung des Zutatenabschnitts.',
    langName: 'Sprache',
  },
};

export function detectDeviceLanguage() {
  const saved = localStorage.getItem('additivealert_lang');
  if (saved && translations[saved]) {
    return saved;
  }
  const browserLang = (navigator.language || navigator.userLanguage || 'cs').toLowerCase();
  if (browserLang.startsWith('cs') || browserLang.startsWith('sk')) {
    return 'cs';
  }
  if (browserLang.startsWith('de')) {
    return 'de';
  }
  return 'en';
}

export function saveLanguage(lang) {
  if (translations[lang]) {
    localStorage.setItem('additivealert_lang', lang);
  }
}
