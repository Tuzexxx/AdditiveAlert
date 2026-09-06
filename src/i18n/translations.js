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
    offlineNotice: 'Bleskový režim: Okamžitá lokální analýza.',
    aiNotice: 'AI Vision: Ověřeno multimodálním modelem.',
    instantPreviewNotice: 'Bleskový náhled z lokální DB (AI zpřesňuje)...',
    langName: 'Jazyk / Language',
    topRiskyTitle: '5 nejčastějších rizikových Éček (úroveň 4 a 5)',
    topRiskySubtitle: 'Pozor na tyto přísady v potravinách (Fér Potravina skóre 4–6)',
    typicalIn: 'Běžný výskyt',
    scannedCount: 'Nalezeno ve skenech',
    times: 'krát',
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
    offlineNotice: 'Fast Mode: Instant local analysis.',
    aiNotice: 'AI Vision: Verified with multimodal model.',
    instantPreviewNotice: 'Instant local match preview (AI refining)...',
    langName: 'Language',
    topRiskyTitle: 'Top 5 Risky Additives to Avoid (Level 4 & 5)',
    topRiskySubtitle: 'Watch out for these additives on labels (Fér Potravina score 4–6)',
    typicalIn: 'Found in',
    scannedCount: 'Found in scans',
    times: 'times',
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
    offlineNotice: 'Schnellmodus: Sofortige lokale Analyse.',
    aiNotice: 'KI-Vision: Mit Multimodalmodell verifiziert.',
    instantPreviewNotice: 'Sofortige Vorschau aus lokaler DB (KI verfeinert)...',
    langName: 'Sprache',
    topRiskyTitle: 'Top 5 bedenkliche Zusatzstoffe (Stufe 4 & 5)',
    topRiskySubtitle: 'Achten Sie auf diese Stoffe beim Einkauf (Fér Potravina 4–6)',
    typicalIn: 'Häufig in',
    scannedCount: 'In Scans gefunden',
    times: 'mal',
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
