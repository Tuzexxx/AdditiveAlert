import { useState, useRef, useEffect } from 'react';
import { Camera, Search, AlertTriangle, CheckCircle, Info, Sparkles, AlertCircle, Globe, Zap, X, FileText, RotateCcw, ArrowRight, Image as ImageIcon, Download } from 'lucide-react';
import { supabase } from '../supabaseClient';
import defaultENumbersData from '../data/e-numbers.json';
import { useLanguage } from '../i18n/LanguageContext';
import { matchAdditivesOffline } from '../utils/fuzzyMatcher';
import { getDeviceId } from '../utils/deviceId';

// Helper function to save a photo directly to the device's downloads/photos
export function savePhotoToDevice(dataUrl, filename) {
  try {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename || `additivealert-etiketa-${Date.now()}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (err) {
    console.warn('Could not save photo to device:', err);
  }
}

// Helper to use native Web Share sheet (or fallback to download) to save into gallery
export async function shareOrSavePhoto(dataUrl) {
  try {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const file = new File([blob], `etiketa-${Date.now()}.jpg`, { type: 'image/jpeg' });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: 'Foto etikety',
      });
      return;
    }
  } catch (e) {
    // Fallback if sharing is canceled or not supported
  }
  savePhotoToDevice(dataUrl);
}

// Helper function to compress and resize camera photos before upload
function compressImage(file, maxDimension = 1280, quality = 0.80) {
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

// Track occurrence counts for level 4 and 5 additives
function recordRiskyScanCounts(items) {
  try {
    const current = JSON.parse(localStorage.getItem('additivealert_risky_counts') || '{}');
    let updated = false;

    items.forEach((item) => {
      if (item.rating >= 4 && item.id && item.id !== 'N/A') {
        const cleanId = item.id.toUpperCase().replace(/\s/g, '');
        current[cleanId] = (current[cleanId] || 0) + 1;
        updated = true;
      }
    });

    if (updated) {
      localStorage.setItem('additivealert_risky_counts', JSON.stringify(current));
      window.dispatchEvent(new Event('additivealert_counts_updated'));
    }
  } catch {
    // ignore
  }
}

const SAMPLES = [
  {
    labelKey: 'sampleSausage',
    text: 'Vepřové maso 80%, pitná voda, jedlá sůl, konzervant: E250 (dusitan sodný), stabilizátor: E450, antioxidant: E300, dextróza, koření.',
  },
  {
    labelKey: 'sampleCola',
    text: 'Voda, oxid uhličitý, barvivo: E150d (amoniak-sulfitový karamel), sladidla: aspartam (E951) a acesulfam K (E950), kyselina fosforečná (E338), přírodní aroma, kofein.',
  },
  {
    labelKey: 'sampleCheese',
    text: 'Sýry, obnovené odstředěné mléko, máslo, tavicí soli: E450, E452, stabilizátor: E339, sůl, regulátor kyselosti: E330.',
  },
];

export default function Scanner() {
  const [scanMode, setScanMode] = useState('camera');
  const [inputText, setInputText] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [results, setResults] = useState([]);
  const [eNumbersData, setENumbersData] = useState(defaultENumbersData);
  const [session, setSession] = useState(null);
  const [statusNotice, setStatusNotice] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [scanError, setScanError] = useState(null);
  const [extractedText, setExtractedText] = useState(null);
  const [hasScanned, setHasScanned] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);
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

  // REAL-TIME BLESKOVÝ NÁHLED: Jakmile uživatel píše nebo vloží text, okamžitě spustíme offline fuzzy match (0 ms)!
  useEffect(() => {
    const text = inputText.trim();
    if (!text || text.length < 3) {
      if (!isScanning && !photoPreview) {
        setResults([]);
        setStatusNotice(null);
      }
      return;
    }

    const timer = setTimeout(() => {
      const localMatches = matchAdditivesOffline(text, eNumbersData);
      if (localMatches.length > 0) {
        const instantArray = localMatches.map(({ item, matchedSnippet }) => ({
          id: item.id,
          name: item.name,
          matchedDb: item,
          rating: item.rating,
          ferpotravinaScore: item.ferpotravinaScore,
          description: item.description,
          category: item.description,
          original_text: matchedSnippet,
          isInstant: true,
        }));
        instantArray.sort((a, b) => b.rating - a.rating);
        setResults(instantArray);
        setStatusNotice(t.instantPreviewNotice);
      }
    }, 120);

    return () => clearTimeout(timer);
  }, [inputText, eNumbersData, t.instantPreviewNotice]);

  // Batch save scan history for anonymous device and authenticated user
  const saveBatchScanHistory = async (items, scanMeta = {}) => {
    if (!items || items.length === 0) return;

    // 1. Update personal scan frequencies for risky additives (ratings 4 & 5)
    recordRiskyScanCounts(items);

    // 2. Crowdsource to global community stats via /api/stats (non-blocking)
    const validIds = items
      .map((item) => (item.id || '').toUpperCase().replace(/\s/g, ''))
      .filter((id) => id && id.startsWith('E') && id !== 'N/A');

    if (validIds.length > 0) {
      fetch('/api/stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: validIds }),
      }).catch((err) => console.warn('Global stats sync notice:', err));
    }

    // 3. Save scan to local device history (anonymous, persistent, zero-login)
    try {
      const deviceId = getDeviceId();
      const existing = JSON.parse(localStorage.getItem('additivealert_scan_history') || '[]');
      
      const newScan = {
        id: 'scan_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        timestamp: new Date().toISOString(),
        deviceId: deviceId,
        snippet: scanMeta.snippet || (scanMeta.hasPhoto ? (lang === 'cs' ? 'Fotografie etikety' : lang === 'de' ? 'Etikettenfoto' : 'Photo of label') : 'Sken složení'),
        hasPhoto: !!scanMeta.hasPhoto,
        additives: items.map((item) => ({
          id: item.id,
          name: item.name,
          czechName: item.matchedDb?.czechName || item.czechName || item.name,
          englishName: item.matchedDb?.englishName || item.englishName || item.name,
          germanName: item.matchedDb?.germanName || item.germanName || item.name,
          rating: item.rating,
          ferpotravinaScore: item.ferpotravinaScore,
          category: item.category,
          original_text: item.original_text,
          description: item.description,
        })),
        maxRating: items.reduce((max, i) => Math.max(max, i.rating || 0), 0),
      };

      const updatedHistory = [newScan, ...existing].slice(0, 50);
      localStorage.setItem('additivealert_scan_history', JSON.stringify(updatedHistory));
      window.dispatchEvent(new Event('additivealert_history_updated'));
    } catch (e) {
      console.warn('Could not save local scan history:', e);
    }

    // 4. If logged into Supabase, also save to cloud account
    if (session && supabase) {
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
        console.warn('Failed to save history batch to Supabase', err);
      }
    }
  };

  // Robust offline fallback parsing using fuzzy matching (abbreviations, stemming, diacritics)
  const extractENumbersOffline = (text) => {
    const matches = matchAdditivesOffline(text, eNumbersData);

    const resultsArray = matches.map(({ item, matchedSnippet }) => ({
      id: item.id,
      name: item.name,
      matchedDb: item,
      rating: item.rating,
      ferpotravinaScore: item.ferpotravinaScore,
      description: item.description,
      category: item.description,
      original_text: matchedSnippet,
      isInstant: true,
    }));

    resultsArray.sort((a, b) => b.rating - a.rating);
    setResults(resultsArray);
    saveBatchScanHistory(resultsArray, {
      snippet: text.slice(0, 80) + (text.length > 80 ? '...' : ''),
      hasPhoto: false,
    });
    setStatusNotice(t.offlineNotice);
    return resultsArray;
  };

  // Main analyze handler: calls Gemini Flash Serverless API with fallback
  const analyzeIngredients = async ({ imageBase64, textContent }) => {
    setIsScanning(true);
    setScanError(null);

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

      if (data.success) {
        const additivesList = Array.isArray(data.additives) ? data.additives : [];
        const detectedText = data.ingredients_summary || '';
        if (detectedText) {
          setExtractedText(detectedText);
        }

        const enriched = additivesList.map((aiItem) => {
          const matchedDb = eNumbersData.find(
            (db) => db.id?.toUpperCase() === (aiItem.id || '').toUpperCase()
          );

          const finalRating = matchedDb?.rating ?? matchedDb?.ferpotravinaScore ?? aiItem.rating ?? 0;

          return {
            id: aiItem.id || 'N/A',
            name: aiItem.name,
            matchedDb: matchedDb,
            original_text: aiItem.original_text,
            category: aiItem.category,
            rating: finalRating,
            ferpotravinaScore: finalRating,
            description: matchedDb?.description || aiItem.reason,
            reason: aiItem.reason,
            isInstant: false,
          };
        });

        enriched.sort((a, b) => b.rating - a.rating);
        setResults(enriched);
        setHasScanned(true);

        saveBatchScanHistory(enriched, {
          snippet: textContent
            ? (textContent.slice(0, 80) + (textContent.length > 80 ? '...' : ''))
            : (detectedText ? (detectedText.slice(0, 80) + (detectedText.length > 80 ? '...' : '')) : null),
          hasPhoto: !!imageBase64,
        });
        setStatusNotice(t.aiNotice);
      } else {
        throw new Error('Invalid response format from Vision API');
      }
    } catch (err) {
      console.warn('AI analysis error, falling back to local database parsing:', err);
      if (textContent) {
        extractENumbersOffline(textContent);
        setHasScanned(true);
      } else {
        setScanError(t.scanFailedNotice);
      }
    } finally {
      setIsScanning(false);
    }
  };

  const handleScanClick = () => {
    setScanError(null);
    setHasScanned(false);
    if (inputText.trim()) {
      analyzeIngredients({ textContent: inputText.trim() });
    } else {
      setResults([]);
    }
  };

  const handleImageUpload = async (e, isFromCamera = false) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setScanError(null);
    setHasScanned(false);
    setExtractedText(null);
    setResults([]);

    try {
      setIsScanning(true);
      const compressedBase64 = await compressImage(file, 1280, 0.80);
      setPhotoPreview(compressedBase64);

      if (isFromCamera) {
        savePhotoToDevice(compressedBase64);
        setSavedNotice(true);
        setTimeout(() => setSavedNotice(false), 4500);
      }

      await analyzeIngredients({ imageBase64: compressedBase64 });
    } catch (err) {
      console.error('Image compression or upload error:', err);
      setScanError(t.scanFailedNotice);
      setIsScanning(false);
    } finally {
      if (cameraInputRef.current) cameraInputRef.current.value = '';
      if (galleryInputRef.current) galleryInputRef.current.value = '';
    }
  };

  const handleSampleClick = (sampleText) => {
    setScanError(null);
    setHasScanned(false);
    setInputText(sampleText);
    analyzeIngredients({ textContent: sampleText });
  };

  const handleReset = () => {
    setInputText('');
    setResults([]);
    setStatusNotice(null);
    setPhotoPreview(null);
    setScanError(null);
    setExtractedText(null);
    setHasScanned(false);
    setSavedNotice(false);
    if (cameraInputRef.current) {
      cameraInputRef.current.value = '';
    }
    if (galleryInputRef.current) {
      galleryInputRef.current.value = '';
    }
  };

  const maxRating = results.length > 0 ? results.reduce((max, i) => Math.max(max, i.rating || 0), 0) : 0;

  let verdictClass = 'safe';
  let verdictTitle = t.verdictSafe;
  let verdictDesc = t.verdictSafeDesc;

  if (maxRating >= 5) {
    verdictClass = 'high';
    verdictTitle = t.verdictHigh;
    verdictDesc = t.verdictHighDesc;
  } else if (maxRating === 4) {
    verdictClass = 'elevated';
    verdictTitle = t.verdictElevated;
    verdictDesc = t.verdictElevatedDesc;
  } else if (maxRating === 3) {
    verdictClass = 'moderate';
    verdictTitle = t.verdictModerate;
    verdictDesc = t.verdictModerateDesc;
  }

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

      {/* Segmented Control (Mode Switcher) */}
      <div className="segmented-control">
        <button
          type="button"
          className={`segmented-btn ${scanMode === 'camera' ? 'active' : ''}`}
          onClick={() => setScanMode('camera')}
        >
          <Camera size={18} />
          {t.tabCamera}
        </button>
        <button
          type="button"
          className={`segmented-btn ${scanMode === 'text' ? 'active' : ''}`}
          onClick={() => setScanMode('text')}
        >
          <FileText size={18} />
          {t.tabText}
        </button>
      </div>

      <div className="glass-panel">
        {isScanning && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '12px 16px',
            background: 'rgba(59, 130, 246, 0.12)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid rgba(59, 130, 246, 0.25)',
            marginBottom: '16px',
            color: '#93c5fd',
          }}>
            <div className="loader" />
            <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>{t.analyzing}</span>
          </div>
        )}

        {/* Hidden file inputs for camera & gallery */}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          ref={cameraInputRef}
          style={{ display: 'none' }}
          onChange={(e) => handleImageUpload(e, true)}
        />
        <input
          type="file"
          accept="image/*"
          ref={galleryInputRef}
          style={{ display: 'none' }}
          onChange={(e) => handleImageUpload(e, false)}
        />

        {scanMode === 'camera' ? (
          <div>
            {photoPreview ? (
              <div style={{ textAlign: 'center' }}>
                <div style={{ position: 'relative', display: 'inline-block', marginBottom: '16px' }}>
                  <img
                    src={photoPreview}
                    alt="Uploaded label"
                    style={{
                      maxHeight: '250px',
                      maxWidth: '100%',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--card-border)',
                      boxShadow: 'var(--shadow-md)',
                      display: 'block',
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleReset}
                    style={{
                      position: 'absolute',
                      top: 8,
                      right: 8,
                      background: 'rgba(0,0,0,0.75)',
                      border: 'none',
                      borderRadius: '50%',
                      color: '#fff',
                      padding: '6px',
                      cursor: 'pointer',
                    }}
                    title="Remove photo"
                  >
                    <X size={16} />
                  </button>
                </div>

                {savedNotice && (
                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 14px',
                    background: 'rgba(34, 197, 94, 0.15)',
                    border: '1px solid rgba(34, 197, 94, 0.3)',
                    borderRadius: '20px',
                    color: '#4ade80',
                    fontSize: '0.84rem',
                    fontWeight: 600,
                    marginBottom: '14px',
                  }}>
                    <CheckCircle size={14} />
                    {t.photoSavedNotice}
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => analyzeIngredients({ imageBase64: photoPreview })}
                    disabled={isScanning}
                  >
                    {isScanning ? (
                      <>
                        <div className="loader" style={{ width: '16px', height: '16px', borderWidth: '2px' }} />
                        {t.analyzing}
                      </>
                    ) : (
                      <>
                        <Search size={18} />
                        {t.analyzePhoto}
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => cameraInputRef.current?.click()}
                    disabled={isScanning}
                  >
                    <Camera size={18} />
                    {t.takePhotoCamera}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => galleryInputRef.current?.click()}
                    disabled={isScanning}
                  >
                    <ImageIcon size={18} />
                    {t.chooseFromGallery}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => shareOrSavePhoto(photoPreview)}
                    title={t.saveToGallery}
                  >
                    <Download size={18} />
                    {t.saveToGallery}
                  </button>
                </div>
              </div>
            ) : (
              <div className="viewfinder-box">
                <div className="viewfinder-corners" />
                <div className="viewfinder-laser" />
                <div className="viewfinder-icon-wrap">
                  <Camera size={28} />
                </div>
                <p style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: '6px' }}>
                  {t.takePhoto}
                </p>
                <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', maxWidth: '340px', margin: '0 auto 16px' }}>
                  {t.cameraPrompt}
                </p>
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ padding: '10px 18px', fontSize: '0.92rem' }}
                    onClick={() => cameraInputRef.current?.click()}
                  >
                    <Camera size={18} />
                    {t.takePhotoCamera}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ padding: '10px 18px', fontSize: '0.92rem' }}
                    onClick={() => galleryInputRef.current?.click()}
                  >
                    <ImageIcon size={18} />
                    {t.chooseFromGallery}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="input-group">
            <textarea
              className="textarea-input"
              placeholder={t.placeholder}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              rows={4}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', gap: '8px', flexWrap: 'wrap' }}>
              <div className="sample-chips-label" style={{ margin: 0 }}>
                {t.trySamples}
              </div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleScanClick}
                disabled={isScanning || !inputText.trim()}
              >
                <Search size={18} />
                {t.analyze}
              </button>
            </div>
            <div className="sample-chips" style={{ marginTop: '8px' }}>
              {SAMPLES.map((sample) => (
                <button
                  key={sample.labelKey}
                  type="button"
                  className="chip-btn"
                  onClick={() => handleSampleClick(sample.text)}
                >
                  {t[sample.labelKey] || sample.labelKey}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Friendly Inline Error Card */}
      {scanError && (
        <div style={{
          marginBottom: '16px',
          padding: '14px 16px',
          background: 'rgba(239, 68, 68, 0.12)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          color: '#fca5a5',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          alignItems: 'center',
          textAlign: 'center',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', fontWeight: 600 }}>
            <AlertTriangle size={18} color="var(--rating-5)" />
            {scanError}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: '8px 14px', fontSize: '0.82rem' }}
              onClick={() => photoPreview ? analyzeIngredients({ imageBase64: photoPreview }) : (inputText ? analyzeIngredients({ textContent: inputText }) : null)}
            >
              <RotateCcw size={14} />
              {t.retryScan}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: '8px 14px', fontSize: '0.82rem' }}
              onClick={() => setScanMode('text')}
            >
              <FileText size={14} />
              {t.tabText}
            </button>
          </div>
        </div>
      )}

      {/* Extracted Label Text Card */}
      {extractedText && (
        <div style={{
          marginBottom: '16px',
          padding: '12px 16px',
          background: 'rgba(255, 255, 255, 0.03)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--card-border)',
          fontSize: '0.82rem',
          color: 'var(--text-secondary)',
          lineHeight: 1.45,
        }}>
          <strong style={{ color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
            🏷️ {t.extractedLabelText}:
          </strong>
          <p style={{ fontStyle: 'italic', margin: 0 }}>"{extractedText}"</p>
        </div>
      )}

      {/* Yuka-Style Overall Product Verdict Card (when additives found) */}
      {results.length > 0 && (
        <div className={`verdict-card verdict-card-${verdictClass}`}>
          <div className={`verdict-circle verdict-circle-${verdictClass}`}>
            {maxRating}/6
          </div>
          <div className="verdict-info">
            <div className="verdict-title">{verdictTitle}</div>
            <div className="verdict-desc">{verdictDesc}</div>
          </div>
          <button
            type="button"
            onClick={handleReset}
            className="btn-icon"
            title={t.newScan}
            style={{ background: 'rgba(255, 255, 255, 0.08)', borderRadius: '50%', padding: '8px' }}
          >
            <RotateCcw size={18} />
          </button>
        </div>
      )}

      {/* Yuka-Style Safe Verdict Card (when 0 additives found after scan) */}
      {hasScanned && results.length === 0 && !isScanning && !scanError && (
        <div className="verdict-card verdict-card-safe">
          <div className="verdict-circle verdict-circle-safe">
            0/6
          </div>
          <div className="verdict-info">
            <div className="verdict-title">{t.verdictSafe}</div>
            <div className="verdict-desc">{t.noAdditivesFound}</div>
          </div>
          <button
            type="button"
            onClick={handleReset}
            className="btn-icon"
            title={t.newScan}
            style={{ background: 'rgba(255, 255, 255, 0.08)', borderRadius: '50%', padding: '8px' }}
          >
            <RotateCcw size={18} />
          </button>
        </div>
      )}

      {/* Open Food Facts Style Ingredients Breakdown */}
      {results.length > 0 && (
        <div className="results-container">
          <div className="results-header">
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {t.resultsHeader}
              {results.some((r) => r.isInstant) && (
                <span style={{ fontSize: '0.75rem', color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '3px', fontWeight: 600 }}>
                  <Zap size={13} /> {t.offlineNotice}
                </span>
              )}
            </span>
            <span className="badge" style={{ background: 'rgba(255,255,255,0.08)' }}>
              {results.length} {t.detectedCount}
            </span>
          </div>

          {results.map((item, index) => {
            const dbItem = item.matchedDb || eNumbersData.find((d) => d.id?.toUpperCase() === (item.id || '').toUpperCase());
            const displayName = getLocalizedAdditiveName(dbItem, item.name, lang);

            return (
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
                    {item.id && item.id !== 'N/A' ? `${item.id} - ` : ''}
                    {displayName}
                  </span>

                  <span className={`badge badge-${item.rating}`}>
                    {t.riskScore}: {item.rating}/6
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
            );
          })}
        </div>
      )}

      {results.length === 0 && inputText && !isScanning && !hasScanned && (
        <div className="empty-state">
          <AlertCircle size={28} style={{ marginBottom: '8px', opacity: 0.6 }} />
          <p>{t.noAdditivesFound}</p>
        </div>
      )}
    </>
  );
}
