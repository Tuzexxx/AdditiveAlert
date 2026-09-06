import { useState, useRef, useEffect } from 'react';
import { Camera, Search, AlertTriangle, CheckCircle, Info, Sparkles, AlertCircle } from 'lucide-react';
import { supabase } from '../supabaseClient';
import defaultENumbersData from '../data/e-numbers.json';
import { useLanguage } from '../i18n/LanguageContext';

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

export default function Scanner() {
  const [inputText, setInputText] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [results, setResults] = useState([]);
  const [eNumbersData, setENumbersData] = useState(defaultENumbersData);
  const [session, setSession] = useState(null);
  const [statusNotice, setStatusNotice] = useState(null);
  const fileInputRef = useRef(null);
  const { lang, t } = useLanguage();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));

    const fetchAdditives = async () => {
      const cached = localStorage.getItem('additivealert_db');
      if (cached) setENumbersData(JSON.parse(cached));

      if (supabase) {
        try {
          const { data, error } = await supabase.from('additives').select('*');
          if (data && !error) {
            const mappedData = data.map((item) => ({
              id: item.id,
              name: item.name,
              englishName: item.english_name,
              rating: item.rating,
              description: item.description,
            }));
            setENumbersData(mappedData);
            localStorage.setItem('additivealert_db', JSON.stringify(mappedData));
          }
        } catch (err) {
          console.error('Failed to sync database:', err);
        }
      }
    };
    fetchAdditives();
  }, []);

  // Batch save scan history for the authenticated user
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

  // Offline fallback parsing using local dictionary
  const extractENumbersOffline = (text) => {
    const resultsArray = [];
    const eRegex = /\b[Ee][-\s]?\d{3,4}[a-z]?\b/g;
    const eMatches = text.match(eRegex) || [];
    const eNumberMatches = [...new Set(eMatches.map((m) => m.replace(/[-\s]/g, '').toUpperCase()))];

    eNumbersData.forEach((item) => {
      const standardId = item.id.toUpperCase();
      let found = false;

      if (eNumberMatches.includes(standardId)) {
        found = true;
      }

      if (!found && item.name?.length > 3) {
        const nameEscaped = item.name.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
        const nameRegex = new RegExp(`(^|[\\s,.:;()\\-])${nameEscaped}([\\s,.:;()\\-]|$)`, 'i');
        if (nameRegex.test(text)) found = true;
      }

      if (!found && item.englishName?.length > 3) {
        const engEscaped = item.englishName.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
        const engRegex = new RegExp(`(^|[\\s,.:;()\\-])${engEscaped}([\\s,.:;()\\-]|$)`, 'i');
        if (engRegex.test(text)) found = true;
      }

      if (found && !resultsArray.find((r) => r.id === item.id)) {
        resultsArray.push({
          id: item.id,
          name: lang === 'en' && item.englishName ? item.englishName : item.name,
          rating: item.rating,
          description: item.description,
          category: null,
          original_text: null,
        });
      }
    });

    eNumberMatches.forEach((eNum) => {
      if (!resultsArray.find((r) => r.id.toUpperCase() === eNum)) {
        resultsArray.push({
          id: eNum,
          name: 'Unknown Additive',
          rating: 3,
          description: 'Not found in local database.',
          category: null,
          original_text: eNum,
        });
      }
    });

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
        // Enrich Gemini results with our curated database ratings where available
        const enriched = data.additives.map((aiItem) => {
          const matchedDb = eNumbersData.find(
            (db) => db.id.toUpperCase() === (aiItem.id || '').toUpperCase()
          );

          return {
            id: aiItem.id || 'N/A',
            name: aiItem.name || matchedDb?.name || aiItem.id,
            original_text: aiItem.original_text,
            category: aiItem.category,
            // Prefer database score if available, otherwise trust Gemini's rating
            rating: matchedDb?.rating ?? aiItem.rating ?? 3,
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
      // Fallback: if we have text input, analyze it offline
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
      // Compress image client-side to prevent Vercel 4.5MB payload limit issues
      const compressedBase64 = await compressImage(file, 1600, 0.85);
      await analyzeIngredients({ imageBase64: compressedBase64 });
    } catch (err) {
      console.error('Image compression or upload error:', err);
      alert(t.errorScan);
      setIsScanning(false);
    } finally {
      // Reset input value so same file can be uploaded again if needed
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <>
      <header className="header">
        <h1>{t.appTitle}</h1>
        <p>{t.appSubtitle}</p>
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
                <span className={`badge badge-${item.rating}`}>
                  {t.riskScore}: {item.rating}/5
                </span>
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
