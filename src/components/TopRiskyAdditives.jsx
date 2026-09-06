import { useState, useEffect, useMemo } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, Flame, TrendingUp } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

// Curated reference knowledge for common packaging harmful additives (ratings 4 & 5)
const KNOWN_DANGER_DETAILS = {
  E250: {
    typicalFoods: {
      cs: 'Uzeniny, párky, šunky, paštiky, slanina',
      en: 'Cured meats, sausages, bacon, ham, pates',
      de: 'Wurstwaren, Schinken, Speck, Pasteten',
    },
    dangerNote: {
      cs: 'Může tvořit karcinogenní nitrosaminy při zahřátí a trávení.',
      en: 'Can form carcinogenic nitrosamines when heated or digested.',
      de: 'Kann beim Erhitzen krebserregende Nitrosamine bilden.',
    },
  },
  E951: {
    typicalFoods: {
      cs: 'Light / Zero nápoje, žvýkačky bez cukru, nízkokalorické jogurty',
      en: 'Diet/zero sodas, sugar-free gum, low-calorie yogurts',
      de: 'Diät-/Zero-Getränke, zuckerfreie Kaugummis, Light-Joghurt',
    },
    dangerNote: {
      cs: 'Umělé sladidlo, WHO klasifikováno jako potenciálně karcinogenní (2B).',
      en: 'Artificial sweetener, classified by WHO/IARC as possibly carcinogenic (2B).',
      de: 'Künstlicher Süßstoff, von der WHO als potenziell krebserregend eingestuft.',
    },
  },
  E102: {
    typicalFoods: {
      cs: 'Barevné cukrovinky, limonády, polevy, pudinky, hořčice',
      en: 'Brightly colored candies, sodas, icings, puddings',
      de: 'Bunte Süßigkeiten, Limonaden, Glasuren, Desserts',
    },
    dangerNote: {
      cs: 'Syntetické azo-barvivo; může zhoršovat hyperaktivitu u dětí (ADHD).',
      en: 'Synthetic azo dye; may impair activity and attention in children.',
      de: 'Synthetischer Azo-Farbstoff; kann Hyperaktivität bei Kindern fördern.',
    },
  },
  E124: {
    typicalFoods: {
      cs: 'Červené cukrovinky, sirupy, dezerty, rybí výrobky',
      en: 'Red candies, syrups, desserts, processed fish products',
      de: 'Rote Süßigkeiten, Sirupe, Desserts, Fischerzeugnisse',
    },
    dangerNote: {
      cs: 'Azo-barvivo s rizikem alergií, v řadě zemí zakázáno nebo přísně omezeno.',
      en: 'Azo dye with high allergy risk, banned or restricted in several countries.',
      de: 'Azo-Farbstoff mit Allergierisiko, in einigen Ländern verboten.',
    },
  },
  E211: {
    typicalFoods: {
      cs: 'Ochucené limonády, dresinky, omáčky, rybí konzervy',
      en: 'Soft drinks, salad dressings, pickles, fruit juices',
      de: 'Erfrischungsgetränke, Dressings, Soßen, Eingelegtes',
    },
    dangerNote: {
      cs: 'V kombinaci s vitamínem C může tvořit benzen (prokázaný karcinogen).',
      en: 'In combination with Vitamin C can form benzene (a known carcinogen).',
      de: 'Kann in Verbindung mit Vitamin C krebserregendes Benzol bilden.',
    },
  },
  E450: {
    typicalFoods: {
      cs: 'Tavené sýry, kypřící prášky, masné výrobky, pečivo',
      en: 'Processed cheese, baking powders, sausages, baked goods',
      de: 'Schmelzkäse, Backpulver, Fleischwaren, Backwaren',
    },
    dangerNote: {
      cs: 'Váže vápník v těle, rizikové pro ledviny a kosti při časté konzumaci.',
      en: 'Binds calcium in the body, risk to kidneys and bones in excess.',
      de: 'Bindet Kalzium im Körper, Risiko für Nieren und Knochen.',
    },
  },
  E110: {
    typicalFoods: {
      cs: 'Oranžové nápoje, polevy, želé, cukrovinky',
      en: 'Orange sodas, icings, jellies, confectionery',
      de: 'Orangefarbene Getränke, Gelees, Süßwaren',
    },
    dangerNote: {
      cs: 'Žluť SY: může vyvolat astma, alergie a hyperaktivitu u dětí.',
      en: 'Sunset Yellow: can trigger asthma, allergies, and hyperactivity.',
      de: 'Gelborange S: kann Asthma, Allergien und Hyperaktivität auslösen.',
    },
  },
};

export default function TopRiskyAdditives({ eNumbersDatabase = [] }) {
  const { lang, t } = useLanguage();
  const [isExpanded, setIsExpanded] = useState(true);
  const [userScanCounts, setUserScanCounts] = useState({});
  const [filterRating, setFilterRating] = useState('all'); // 'all', '5', '4'

  // Load scan frequencies from localStorage
  useEffect(() => {
    const loadCounts = () => {
      try {
        const stored = localStorage.getItem('additivealert_risky_counts');
        if (stored) {
          setUserScanCounts(JSON.parse(stored));
        }
      } catch {
        // ignore
      }
    };
    loadCounts();

    // Listen for storage changes if multiple tabs open
    window.addEventListener('storage', loadCounts);
    return () => window.removeEventListener('storage', loadCounts);
  }, []);

  // Filter and sort according to user rules:
  // Step 1: Harmfulness level (5 first, then 4)
  // Step 2: Frequency of searches/scans (highest count first)
  const topRiskyList = useMemo(() => {
    // Filter database for harmful items (rating 4 and 5)
    let candidates = eNumbersDatabase.filter(
      (item) => item.rating >= 4 || (item.ferpotravinaScore && item.ferpotravinaScore >= 4)
    );

    // Apply rating filter if selected
    if (filterRating === '5') {
      candidates = candidates.filter((item) => item.rating === 5);
    } else if (filterRating === '4') {
      candidates = candidates.filter((item) => item.rating === 4);
    }

    // Sort: 1. Harmfulness (5 before 4) -> 2. Search frequency (highest count first)
    candidates.sort((a, b) => {
      // Step 1: Rating level (5 before 4)
      if (b.rating !== a.rating) {
        return b.rating - a.rating;
      }
      // Step 2: Frequency of user scans (higher count first)
      const countA = userScanCounts[a.id] || 0;
      const countB = userScanCounts[b.id] || 0;
      if (countB !== countA) {
        return countB - countA;
      }
      // Step 3: Tie-breaker by Fér Potravina score (6 before 5 before 4)
      const ferA = a.ferpotravinaScore ?? 0;
      const ferB = b.ferpotravinaScore ?? 0;
      return ferB - ferA;
    });

    // Take top 5
    return candidates.slice(0, 5);
  }, [eNumbersDatabase, userScanCounts, filterRating]);

  const getLocalizedName = (item) => {
    if (lang === 'en') return item.englishName || item.name;
    if (lang === 'de') return item.germanName || item.name;
    return item.czechName || item.name;
  };

  const hasAnyScans = Object.values(userScanCounts).some((c) => c > 0);

  return (
    <div className="glass-panel top-risky-panel">
      <div
        className="top-risky-header"
        onClick={() => setIsExpanded(!isExpanded)}
        style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
      >
        <div>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0, fontSize: '1.05rem' }}>
            <Flame size={20} color="var(--rating-5)" />
            {t.topRiskyTitle}
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            {t.topRiskySubtitle} (1. {t.riskScore} ➔ 2. {t.scannedCount})
          </p>
        </div>
        <button type="button" className="btn-icon" style={{ padding: '4px' }}>
          {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </button>
      </div>

      {isExpanded && (
        <>
          {/* Level Filter Tabs */}
          <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className={`lang-btn ${filterRating === 'all' ? 'active' : ''}`}
              onClick={(e) => { e.stopPropagation(); setFilterRating('all'); }}
              style={{ fontSize: '0.78rem', padding: '4px 10px', borderRadius: '12px' }}
            >
              Vše (5 & 4)
            </button>
            <button
              type="button"
              className={`lang-btn ${filterRating === '5' ? 'active' : ''}`}
              onClick={(e) => { e.stopPropagation(); setFilterRating('5'); }}
              style={{ fontSize: '0.78rem', padding: '4px 10px', borderRadius: '12px', color: filterRating === '5' ? '#fff' : 'var(--rating-5)' }}
            >
              🔴 Pouze úroveň 5/5
            </button>
            <button
              type="button"
              className={`lang-btn ${filterRating === '4' ? 'active' : ''}`}
              onClick={(e) => { e.stopPropagation(); setFilterRating('4'); }}
              style={{ fontSize: '0.78rem', padding: '4px 10px', borderRadius: '12px', color: filterRating === '4' ? '#fff' : 'var(--rating-4)' }}
            >
              🟠 Pouze úroveň 4/5
            </button>
          </div>

          <div className="top-risky-list" style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {topRiskyList.map((item, idx) => {
              const scanCount = userScanCounts[item.id] || 0;
              const localizedName = getLocalizedName(item);
              const dangerInfo = KNOWN_DANGER_DETAILS[item.id];
              const foodSources = dangerInfo?.typicalFoods?.[lang] || dangerInfo?.typicalFoods?.cs || item.description;
              const dangerExplanation = dangerInfo?.dangerNote?.[lang] || dangerInfo?.dangerNote?.cs || item.description;

              return (
                <div
                  key={item.id}
                  className="top-risky-item"
                  style={{
                    background: 'rgba(0, 0, 0, 0.25)',
                    borderLeft: `4px solid ${item.rating === 5 ? 'var(--rating-5)' : 'var(--rating-4)'}`,
                    borderRadius: '8px',
                    padding: '10px 14px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.98rem' }}>
                      <span style={{ color: 'var(--text-secondary)', marginRight: '6px', fontSize: '0.85rem' }}>#{idx + 1}</span>
                      <span style={{ color: 'var(--accent-color)', marginRight: '6px' }}>{item.id}</span>
                      {localizedName}
                    </div>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      {item.ferpotravinaScore !== null && (
                        <span className="badge-ferpotravina">Fér: {item.ferpotravinaScore}/6</span>
                      )}
                      <span className={`badge badge-${item.rating}`}>
                        {t.riskScore}: {item.rating}/5
                      </span>
                    </div>
                  </div>

                  {dangerExplanation && (
                    <div style={{ fontSize: '0.82rem', color: '#fca5a5', marginTop: '4px' }}>
                      {dangerExplanation}
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '6px', flexWrap: 'wrap', gap: '4px' }}>
                    {foodSources && (
                      <span>
                        <strong>{t.typicalIn}:</strong> {foodSources}
                      </span>
                    )}

                    {scanCount > 0 ? (
                      <span style={{ color: 'var(--rating-4)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <TrendingUp size={13} />
                        {t.scannedCount}: {scanCount}×
                      </span>
                    ) : (
                      <span style={{ opacity: 0.6 }}>
                        Běžné na trhu
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
