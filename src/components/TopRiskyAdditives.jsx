import { useState, useEffect } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

const DEFAULT_RISKY_ADDITIVES = [
  {
    id: 'E250',
    czechName: 'Dusitan sodný',
    englishName: 'Sodium nitrite',
    germanName: 'Natriumnitrit',
    rating: 5,
    ferpotravinaScore: 5,
    typicalFoods: {
      cs: 'Uzeniny, párky, šunky, paštiky',
      en: 'Cured meats, sausages, bacon, ham',
      de: 'Wurstwaren, Schinken, Speck',
    },
    dangerNote: {
      cs: 'Může tvořit karcinogenní nitrosaminy při zahřátí a trávení.',
      en: 'Can form carcinogenic nitrosamines when heated or digested.',
      de: 'Kann beim Erhitzen krebserregende Nitrosamine bilden.',
    },
  },
  {
    id: 'E450',
    czechName: 'Difosforečnany',
    englishName: 'Diphosphates',
    germanName: 'Diphosphate',
    rating: 4,
    ferpotravinaScore: 3,
    typicalFoods: {
      cs: 'Tavené sýry, kypřící prášky, masné výrobky',
      en: 'Processed cheese, baking powders, sausages',
      de: 'Schmelzkäse, Backpulver, Fleischwaren',
    },
    dangerNote: {
      cs: 'Váže vápník v těle, rizikové pro ledviny a kosti při časté konzumaci.',
      en: 'Binds calcium in the body, risk to kidneys and bones in excess.',
      de: 'Bindet Kalzium im Körper, Risiko für Nieren und Knochen.',
    },
  },
  {
    id: 'E102',
    czechName: 'Tartrazin',
    englishName: 'Tartrazine',
    germanName: 'Tartrazin',
    rating: 4,
    ferpotravinaScore: 4,
    typicalFoods: {
      cs: 'Barevné cukrovinky, limonády, polevy, pudinky',
      en: 'Brightly colored candies, sodas, icings, desserts',
      de: 'Bunte Süßigkeiten, Limonaden, Glasuren',
    },
    dangerNote: {
      cs: 'Syntetické azo-barvivo; může zhoršovat hyperaktivitu u dětí (ADHD).',
      en: 'Synthetic azo dye; may impair activity and attention in children.',
      de: 'Synthetischer Azo-Farbstoff; kann Hyperaktivität bei Kindern fördern.',
    },
  },
  {
    id: 'E211',
    czechName: 'Benzoan sodný',
    englishName: 'Sodium benzoate',
    germanName: 'Natriumbenzoat',
    rating: 4,
    ferpotravinaScore: 4,
    typicalFoods: {
      cs: 'Ochucené limonády, dresinky, omáčky, rybí konzervy',
      en: 'Soft drinks, salad dressings, pickles, fruit juices',
      de: 'Erfrischungsgetränke, Dressings, Soßen, Eingelegtes',
    },
    dangerNote: {
      cs: 'V kombinaci s vitamínem C může tvořit benzen (karcinogen).',
      en: 'In combination with Vitamin C can form benzene (a known carcinogen).',
      de: 'Kann in Verbindung mit Vitamin C krebserregendes Benzol bilden.',
    },
  },
  {
    id: 'E951',
    czechName: 'Aspartam',
    englishName: 'Aspartame',
    germanName: 'Aspartam',
    rating: 5,
    ferpotravinaScore: 5,
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
];

export default function TopRiskyAdditives({ eNumbersDatabase = [] }) {
  const { lang, t } = useLanguage();
  const [isExpanded, setIsExpanded] = useState(true);
  const [userScanCounts, setUserScanCounts] = useState({});

  useEffect(() => {
    try {
      const stored = localStorage.getItem('additivealert_risky_counts');
      if (stored) {
        setUserScanCounts(JSON.parse(stored));
      }
    } catch {
      // ignore
    }
  }, []);

  const getLocalizedName = (item) => {
    if (lang === 'en') return item.englishName || item.name;
    if (lang === 'de') return item.germanName || item.name;
    return item.czechName || item.name;
  };

  return (
    <div className="glass-panel top-risky-panel">
      <div 
        className="top-risky-header" 
        onClick={() => setIsExpanded(!isExpanded)}
        style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
      >
        <div>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0, fontSize: '1.05rem' }}>
            <AlertTriangle size={18} color="var(--rating-5)" />
            {t.topRiskyTitle}
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            {t.topRiskySubtitle}
          </p>
        </div>
        <button type="button" className="btn-icon" style={{ padding: '4px' }}>
          {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </button>
      </div>

      {isExpanded && (
        <div className="top-risky-list" style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {DEFAULT_RISKY_ADDITIVES.map((item) => {
            const scanCount = userScanCounts[item.id] || 0;
            const localizedName = getLocalizedName(item);
            const foodSources = item.typicalFoods[lang] || item.typicalFoods.cs;
            const dangerExplanation = item.dangerNote[lang] || item.dangerNote.cs;

            return (
              <div key={item.id} className="top-risky-item" style={{
                background: 'rgba(0, 0, 0, 0.25)',
                borderLeft: `4px solid ${item.rating === 5 ? 'var(--rating-5)' : 'var(--rating-4)'}`,
                borderRadius: '8px',
                padding: '10px 14px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.98rem' }}>
                    <span style={{ color: 'var(--accent-color)', marginRight: '6px' }}>{item.id}</span>
                    {localizedName}
                  </div>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <span className="badge-ferpotravina">Fér: {item.ferpotravinaScore}/6</span>
                    <span className={`badge badge-${item.rating}`}>{t.riskScore}: {item.rating}/5</span>
                  </div>
                </div>

                <div style={{ fontSize: '0.82rem', color: '#fca5a5', marginTop: '4px' }}>
                  {dangerExplanation}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '6px', flexWrap: 'wrap', gap: '4px' }}>
                  <span>
                    <strong>{t.typicalIn}:</strong> {foodSources}
                  </span>
                  {scanCount > 0 && (
                    <span style={{ color: 'var(--rating-4)', fontWeight: 600 }}>
                      ⚠️ {t.scannedCount}: {scanCount}x
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
