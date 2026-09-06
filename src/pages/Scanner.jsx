import { useState, useRef, useEffect } from 'react';
import { Camera, Search, AlertTriangle, CheckCircle, Info, Sparkles, AlertCircle, Globe } from 'lucide-react';
import { supabase } from '../supabaseClient';
import defaultENumbersData from '../data/e-numbers.json';
import { useLanguage } from '../i18n/LanguageContext';
import { matchAdditivesOffline } from '../utils/fuzzyMatcher';

// Helper function to compress and resize camera photos before upload
function compressImage(file, maxDimension = 1600, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(compressedDataUrl);
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
}

function getLocalizedAdditiveName(dbItem, fallbackName, currentLang) {
  if (currentLang === 'en') {
    return dbItem?.englishName || fallbackName || dbItem?.name;
  }
  if (currentLang === 'de') {
    return dbItem?.germanName || fallbackName || dbItem?.name;
  }
  return dbItem?.czechName || dbItem?.name || fallbackName;
}

export default function Scanner() {
  const [inputText, setInputText] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [results, setResults] = useState([]);
  const [eNumbersData, setENumbersData] = useState(defaultENumbersData);
  const [session, setSession] = useState(null);
  const [statusNotice, setStatusNotice] = useState(null);
  const fileInputRef = useRef(null);
  const { lang, setLanguage, t } = useLanguage();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));

    const fetchAdditives = async () => {
      // Invalidate old stale caches
      localStorage.removeItem('additivealert_db');
      
      const cached = localStorage.getItem('additivealert_db_v3');
      if (cached) {
        setENumbersData(JSON.parse(cached));
      } else {
        setENumbersData(defaultENumbersData);
      }

      if (supabase) {
        try {
          const { data, error } = await supabase.from('additives').select('*');
          if (data && !error && data.length > 0) {
            const mappedData = data.map((item) => ({
              id: item.id,
              name: item.name,
              czechName: item.czech_name || item.name,
              englishName: item.english_name,
              germanName: item.german_name,
              ferpotravinaScore: item.ferpotravina_score,
              rating: item.rating,
              description: item.description,
            }));
            setENumbersData(mappedData);
            localStorage.setItem('additivealert_db_v3', JSON.stringify(mappedData));
          }
        } catch (err) {
          console.warn('Supabase offline or unreachable, using local database:', err);
        }
      }
    };
    fetchAdditives();
  }, []);

  // Batch save scan history for authenticated user
  const saveBatchScanHistory = async (items) => {
    if (!session || !supabase || !items.length) return;
    try {
      const rows = items.map((item) => ({
        user_id: session.user.id,
        ingredient_name: item.name || item.id,
        e_number: item.id,
        rating: item.rating,
        risk_level: item.rating >= 4 ? 'High' : item.rating <= 2 ? 'Low' : 'Medium',
      }));
      await supabase.from('scan_history').insert(rows);
    } catch (err) {
      console.error('Failed to save history batch', err);
    }
  };

  // Robust offline fallback parsing using fuzzy matching (abbreviations, stemming, diacritics)
  const extractENumbersOffline = (text) => {
    const matches = matchAdditivesOffline(text, eNumbersData);

    const resultsArray = matches.map(({ item, matchedSnippet }) => ({
      id: item.id,
      name: getLocalizedAdditiveName(item, item.name, lang),
      rating: item.rating,
      ferpotravinaScore: item.ferpotravinaScore,
      description: item.description,
      category: item.description,
      original_text: matchedSnippet,
    }));

    resultsArray.sort((a, b) => b.rating - a.rating);
    setResults(resultsArray);
    saveBatchScanHistory(resultsArray);
    setStatusNotice(t.offlineNotice);
  };

  // Main analyze handler: calls Gemini Flash Serverless API with fallback
  const analyzeIngredients = async ({ imageBase64, textContent }) => {
    setIsScanning(true);
    setStatusNotice(null);

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: imageBase64,
          text: textContent,
          language: lang,
        }),
      });

      if (!response.ok) {
        throw new Error(`API responded with ${response.status}`);
      }

      const data = await response.json();

      if (data.success && Array.isArray(data.additives)) {
        const enriched = data.additives.map((aiItem) => {
          const matchedDb = eNumbersData.find(
            (db) => db.id.toUpperCase() === (aiItem.id || '').toUpperCase()
          );

          // Get accurate rating: strict adherence to Fér Potravina if matched
          const finalRating = matchedDb?.rating ?? aiItem.rating ?? 3;
          const ferpotravinaScore = matchedDb?.ferpotravinaScore ?? (matchedDb?.rating != null ? matchedDb.rating : null);

          return {
            id: aiItem.id || 'N/A',
            name: getLocalizedAdditiveName(matchedDb, aiItem.name, lang),
            original_text: aiItem.original_text,
            category: aiItem.category,
            rating: finalRating,
            ferpotravinaScore: ferpotravinaScore,
            description: matchedDb?.description || aiItem.reason,
            reason: aiItem.reason,
          };
        });

        enriched.sort((a, b) => b.rating - a.rating);
        setResults(enriched);
        saveBatchScanHistory(enriched);
        setStatusNotice(t.aiNotice);
      } else {
        throw new Error('Invalid response format from Vision API');
      }
    } catch (err) {
      console.warn('AI analysis error, falling back to local database parsing:', err);
      if (textContent) {
        extractENumbersOffline(textContent);
      } else {
        alert(t.errorScan);
      }
    } finally {
      setIsScanning(false);
    }
  };

  const handleScanClick = () => {
    if (inputText.trim()) {
      analyzeIngredients({ textContent: inputText.trim() });
    } else {
      setResults([]);
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsScanning(true);
      const compressedBase64 = await compressImage(file, 1600, 0.85);
      await analyzeIngredients({ imageBase64: compressedBase64 });
    } catch (err) {
      console.error('Image compression or upload error:', err);
      alert(t.errorScan);
      setIsScanning(false);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <>
      <header className="header">
        <h1>{t.appTitle}</h1>
        <p>{t.appSubtitle}</p>
        
        {/* Prominent Language Switcher */}
        <div className="language-bar">
          <Globe size={14} style={{ opacity: 0.7 }} />
          <span>{t.langName}:</span>
          <div className="lang-pills">
            <button
              type="button"
              className={`lang-pill ${lang === 'cs' ? 'active' : ''}`}
              onClick={() => setLanguage('cs')}
            >
              🇨🇿 Čeština
            </button>
            <button
              type="button"
              className={`lang-pill ${lang === 'en' ? 'active' : ''}`}
              onClick={() => setLanguage('en')}
            >
              🇬🇧 English
            </button>
            <button
              type="button"
              className={`lang-pill ${lang === 'de' ? 'active' : ''}`}
              onClick={() => setLanguage('de')}
            >
              🇩🇪 Deutsch
            </button>
          </div>
        </div>

        {statusNotice && (
          <span className="mode-tag">
            <Sparkles size={12} style={{ marginRight: '4px', verticalAlign: '-1px' }} />
            {statusNotice}
          </span>
        )}
      </header>

      <div className="glass-panel">
        {isScanning && (
          <div className="upload-overlay">
            <div className="loader"></div>
            <p style={{ fontWeight: 600 }}>{t.analyzing}</p>
          </div>
        )}

        <div className="input-group">
          <textarea
            className="textarea-input"
            placeholder={t.placeholder}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
          />
          <div className="btn-group">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => fileInputRef.current?.click()}
              disabled={isScanning}
            >
              <Camera size={20} />
              {t.scanPhoto}
            </button>
            <input
              type="file"
              accept="image/*"
              ref={fileInputRef}
              style={{ display: 'none' }}
              onChange={handleImageUpload}
            />
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleScanClick}
              disabled={isScanning}
            >
              <Search size={20} />
              {t.analyze}
            </button>
          </div>
        </div>
      </div>

      {results.length > 0 && (
        <div className="results-container">
          <div className="results-header">
            <span>{t.resultsHeader}</span>
            <span className="badge" style={{ background: 'rgba(255,255,255,0.1)' }}>
              {results.length} {t.foundCount}
            </span>
          </div>

          {results.map((item, index) => (
            <div key={`${item.id}-${index}`} className={`ingredient-card rating-${item.rating}`}>
              <div className="card-header">
                <span className="card-title">
                  {item.rating >= 4 ? (
                    <AlertTriangle size={18} color="var(--rating-5)" />
                  ) : item.rating <= 2 ? (
                    <CheckCircle size={18} color="var(--rating-1)" />
                  ) : (
                    <Info size={18} color="var(--rating-3)" />
                  )}
                  {item.id !== 'N/A' ? `${item.id} - ` : ''}
                  {item.name}
                </span>

                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  {item.ferpotravinaScore !== null && item.ferpotravinaScore !== undefined && (
                    <span className="badge-ferpotravina" title="Originální skóre škodlivosti podle Fér Potravina (0-6)">
                      Fér: {item.ferpotravinaScore}/6
                    </span>
                  )}
                  <span className={`badge badge-${item.rating}`}>
                    {t.riskScore}: {item.rating}/5
                  </span>
                </div>
              </div>

              {item.description && <p className="card-desc">{item.description}</p>}

              {item.reason && item.reason !== item.description && (
                <div className="card-reason">
                  <strong>{t.whyCare}:</strong> {item.reason}
                </div>
              )}

              <div className="card-meta">
                {item.category && (
                  <span className="card-meta-item">
                    {t.category}: {item.category}
                  </span>
                )}
                {item.original_text && (
                  <span className="card-meta-item">
                    {t.originalText}: <em>"{item.original_text}"</em>
                  </span>
                )}
                <span className="card-meta-item">
                  {t.riskLevels[item.rating] || ''}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {results.length === 0 && inputText && !isScanning && (
        <div className="empty-state">
          <AlertCircle size={28} style={{ marginBottom: '8px', opacity: 0.6 }} />
          <p>{t.noAdditivesFound}</p>
        </div>
      )}
    </>
  );
}
