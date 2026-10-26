import { useState, useRef, useEffect, useMemo } from 'react';
import {
  Camera,
  Search,
  AlertTriangle,
  CheckCircle,
  Info,
  Sparkles,
  AlertCircle,
  X,
  FileText,
  RotateCcw,
  Image as ImageIcon,
  Download,
  Copy,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
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
  } catch {
    // Fallback if sharing is canceled or not supported
  }
  savePhotoToDevice(dataUrl);
}

// Helper function to compress and resize camera photos before upload
function compressImage(file, maxDimension = 1280, quality = 0.8) {
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

  // Ergonomic UX state additions
  const [filterRisk, setFilterRisk] = useState('all'); // 'all' | 'risky' | 'moderate' | 'safe'
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedIds, setExpandedIds] = useState({});
  const [isTextExpanded, setIsTextExpanded] = useState(false);
  const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);
  const [copiedSummary, setCopiedSummary] = useState(false);

  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);
  const { lang, t } = useLanguage();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));

    const fetchAdditives = async () => {
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

  // Real-time fuzzy match preview when typing or pasting text
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
  }, [inputText, eNumbersData, t.instantPreviewNotice, isScanning, photoPreview]);

  // When results change, expand risky items (4+) by default; keep safe items compact
  useEffect(() => {
    if (results.length > 0) {
      const initial = {};
      results.forEach((item, idx) => {
        const key = `${item.id}-${idx}`;
        if ((item.rating || 0) >= 4) {
          initial[key] = true;
        }
      });
      setExpandedIds(initial);
    } else {
      setExpandedIds({});
      setFilterRisk('all');
      setSearchQuery('');
    }
  }, [results]);

  // Batch save scan history for anonymous device and authenticated user
  const saveBatchScanHistory = async (items, scanMeta = {}) => {
    if (!items || items.length === 0) return;

    recordRiskyScanCounts(items);

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

    try {
      const deviceId = getDeviceId();
      const existing = JSON.parse(localStorage.getItem('additivealert_scan_history') || '[]');

      const newScan = {
        id: 'scan_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        timestamp: new Date().toISOString(),
        deviceId: deviceId,
        snippet:
          scanMeta.snippet ||
          (scanMeta.hasPhoto
            ? lang === 'cs'
              ? 'Fotografie etikety'
              : lang === 'de'
                ? 'Etikettenfoto'
                : 'Photo of label'
            : 'Sken složení'),
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
            ? textContent.slice(0, 80) + (textContent.length > 80 ? '...' : '')
            : detectedText
              ? detectedText.slice(0, 80) + (detectedText.length > 80 ? '...' : '')
              : null,
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
      const compressedBase64 = await compressImage(file, 1280, 0.8);
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
    setFilterRisk('all');
    setSearchQuery('');
    setExpandedIds({});
    setIsTextExpanded(false);
    setIsPhotoModalOpen(false);
    if (cameraInputRef.current) cameraInputRef.current.value = '';
    if (galleryInputRef.current) galleryInputRef.current.value = '';
  };

  const toggleExpand = (key) => {
    setExpandedIds((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const maxRating =
    results.length > 0 ? results.reduce((max, i) => Math.max(max, i.rating || 0), 0) : 0;

  const riskyCount = useMemo(() => results.filter((r) => (r.rating || 0) >= 4).length, [results]);
  const moderateCount = useMemo(() => results.filter((r) => (r.rating || 0) === 3).length, [results]);
  const safeCount = useMemo(() => results.filter((r) => (r.rating || 0) <= 2).length, [results]);

  const filteredResults = useMemo(() => {
    return results.filter((item) => {
      const score = item.rating || 0;
      if (filterRisk === 'risky' && score < 4) return false;
      if (filterRisk === 'moderate' && score !== 3) return false;
      if (filterRisk === 'safe' && score > 2) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const dbItem =
          item.matchedDb ||
          eNumbersData.find((d) => d.id?.toUpperCase() === (item.id || '').toUpperCase());
        const displayName = getLocalizedAdditiveName(dbItem, item.name, lang).toLowerCase();
        const code = (item.id || '').toLowerCase();
        const desc = (item.description || '').toLowerCase();
        const reason = (item.reason || '').toLowerCase();
        const cat = (item.category || '').toLowerCase();

        return (
          displayName.includes(q) ||
          code.includes(q) ||
          desc.includes(q) ||
          reason.includes(q) ||
          cat.includes(q)
        );
      }

      return true;
    });
  }, [results, filterRisk, searchQuery, eNumbersData, lang]);

  const allFilteredExpanded = useMemo(() => {
    if (filteredResults.length === 0) return false;
    return filteredResults.every((item, idx) => expandedIds[`${item.id}-${idx}`]);
  }, [filteredResults, expandedIds]);

  const toggleAllExpanded = () => {
    const nextState = !allFilteredExpanded;
    const nextMap = {};
    if (nextState) {
      filteredResults.forEach((item, idx) => {
        nextMap[`${item.id}-${idx}`] = true;
      });
    }
    setExpandedIds(nextMap);
  };

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

  const handleCopySummary = async () => {
    if (results.length === 0) return;
    try {
      const header = `${t.appTitle} - ${t.overallScore}: ${maxRating}/6 (${verdictTitle})`;
      const itemsList = results
        .map((item) => {
          const dbItem =
            item.matchedDb ||
            eNumbersData.find((d) => d.id?.toUpperCase() === (item.id || '').toUpperCase());
          const displayName = getLocalizedAdditiveName(dbItem, item.name, lang);
          const code = item.id && item.id !== 'N/A' ? `${item.id} - ` : '';
          const cat = item.category ? ` (${item.category})` : '';
          return `• ${code}${displayName} [${item.rating}/6]${cat}`;
        })
        .join('\n');

      const fullText = `${header}\n\n${t.resultsHeader} (${results.length}):\n${itemsList}`;
      await navigator.clipboard.writeText(fullText);
      setCopiedSummary(true);
      setTimeout(() => setCopiedSummary(false), 2500);
    } catch {
      // ignore
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

      {/* Segmented Control (Mode Switcher) */}
      <div className="segmented-control">
        <button
          type="button"
          className={`segmented-btn ${scanMode === 'camera' ? 'active' : ''}`}
          onClick={() => setScanMode('camera')}
        >
          <Camera size={17} />
          {t.tabCamera}
        </button>
        <button
          type="button"
          className={`segmented-btn ${scanMode === 'text' ? 'active' : ''}`}
          onClick={() => setScanMode('text')}
        >
          <FileText size={17} />
          {t.tabText}
        </button>
      </div>

      <div className="glass-panel">
        {isScanning && (
          <div className="scanner-status-bar">
            <div className="loader" />
            <span className="scanner-status-text">{t.analyzing}</span>
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
              <div className="compact-photo-bar">
                <button
                  type="button"
                  className="photo-thumb-btn"
                  onClick={() => setIsPhotoModalOpen(true)}
                  title="Kliknutím zvětšit foto"
                >
                  <img src={photoPreview} alt="Etiketa" className="photo-thumb-img" />
                  <span className="photo-thumb-zoom-badge">
                    <Search size={10} />
                  </span>
                </button>

                <div className="compact-photo-info">
                  <span className="compact-photo-title">{t.photoReady}</span>
                  {savedNotice ? (
                    <span className="compact-photo-saved">
                      <CheckCircle size={12} /> {t.photoSavedNotice}
                    </span>
                  ) : (
                    <span className="compact-photo-sub">
                      {isScanning
                        ? t.analyzing
                        : results.length > 0
                          ? `${results.length} ${t.detectedCount}`
                          : 'Etiketa načtena'}
                    </span>
                  )}
                </div>

                <div className="compact-photo-actions">
                  <button
                    type="button"
                    className="compact-action-btn"
                    onClick={() => cameraInputRef.current?.click()}
                    disabled={isScanning}
                    title={t.takePhotoCamera}
                  >
                    <Camera size={16} />
                  </button>
                  <button
                    type="button"
                    className="compact-action-btn"
                    onClick={() => galleryInputRef.current?.click()}
                    disabled={isScanning}
                    title={t.chooseFromGallery}
                  >
                    <ImageIcon size={16} />
                  </button>
                  <button
                    type="button"
                    className="compact-action-btn"
                    onClick={() => shareOrSavePhoto(photoPreview)}
                    title={t.saveToGallery}
                  >
                    <Download size={16} />
                  </button>
                  <button
                    type="button"
                    className="compact-action-btn compact-action-remove"
                    onClick={handleReset}
                    disabled={isScanning}
                    title={t.removePhoto}
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            ) : (
              <div
                className="viewfinder-box"
                onClick={() => cameraInputRef.current?.click()}
                role="button"
                tabIndex={0}
              >
                <div className="viewfinder-corners" />
                <div className="viewfinder-laser" />
                <div className="viewfinder-icon-wrap">
                  <Camera size={26} />
                </div>
                <p className="viewfinder-title">{t.takePhoto}</p>
                <p className="viewfinder-sub">{t.cameraPrompt}</p>

                <div
                  className="viewfinder-actions"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => cameraInputRef.current?.click()}
                  >
                    <Camera size={16} />
                    {t.takePhotoCamera}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => galleryInputRef.current?.click()}
                  >
                    <ImageIcon size={16} />
                    {t.chooseFromGallery}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="input-group">
            <div className="textarea-wrapper">
              <textarea
                className="textarea-input"
                placeholder={t.placeholder}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                rows={3}
              />
              {inputText && (
                <button
                  type="button"
                  className="textarea-clear-btn"
                  onClick={() => setInputText('')}
                  title="Smazat text"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <div className="text-actions-bar">
              <div className="sample-chips-label">{t.trySamples}</div>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={handleScanClick}
                disabled={isScanning || !inputText.trim()}
              >
                <Search size={16} />
                {t.analyze}
              </button>
            </div>

            <div className="sample-chips">
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
        <div className="error-card">
          <div className="error-title">
            <AlertTriangle size={18} color="var(--rating-5)" />
            {scanError}
          </div>
          <div className="error-actions">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() =>
                photoPreview
                  ? analyzeIngredients({ imageBase64: photoPreview })
                  : inputText
                    ? analyzeIngredients({ textContent: inputText })
                    : null
              }
            >
              <RotateCcw size={14} />
              {t.retryScan}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setScanMode('text')}
            >
              <FileText size={14} />
              {t.tabText}
            </button>
          </div>
        </div>
      )}

      {/* Yuka-Style Overall Product Verdict Card (when additives found) */}
      {results.length > 0 && (
        <div className={`verdict-card verdict-card-${verdictClass}`}>
          <div className="verdict-main">
            <div className={`verdict-circle verdict-circle-${verdictClass}`}>
              {maxRating}/6
            </div>
            <div className="verdict-info">
              <div className="verdict-title">{verdictTitle}</div>
              <div className="verdict-desc">{verdictDesc}</div>

              {/* Interactive Breakdown Pill Badges */}
              <div className="verdict-breakdown">
                {riskyCount > 0 && (
                  <button
                    type="button"
                    className={`breakdown-chip breakdown-chip-risky ${filterRisk === 'risky' ? 'active' : ''}`}
                    onClick={() => setFilterRisk(filterRisk === 'risky' ? 'all' : 'risky')}
                    title="Filtrovat riziková"
                  >
                    <span className="dot dot-risky" />
                    {riskyCount} {t.filterRisky}
                  </button>
                )}
                {moderateCount > 0 && (
                  <button
                    type="button"
                    className={`breakdown-chip breakdown-chip-moderate ${filterRisk === 'moderate' ? 'active' : ''}`}
                    onClick={() => setFilterRisk(filterRisk === 'moderate' ? 'all' : 'moderate')}
                    title="Filtrovat ke zvážení"
                  >
                    <span className="dot dot-moderate" />
                    {moderateCount} {t.filterModerate}
                  </button>
                )}
                {safeCount > 0 && (
                  <button
                    type="button"
                    className={`breakdown-chip breakdown-chip-safe ${filterRisk === 'safe' ? 'active' : ''}`}
                    onClick={() => setFilterRisk(filterRisk === 'safe' ? 'all' : 'safe')}
                    title="Filtrovat bezpečná"
                  >
                    <span className="dot dot-safe" />
                    {safeCount} {t.filterSafe}
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="verdict-actions">
            <button
              type="button"
              onClick={handleCopySummary}
              className={`btn-icon ${copiedSummary ? 'copied' : ''}`}
              title={copiedSummary ? t.summaryCopied : t.copySummary}
            >
              {copiedSummary ? <CheckCircle size={18} color="#34d399" /> : <Copy size={18} />}
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="btn-icon"
              title={t.newScan}
            >
              <RotateCcw size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Yuka-Style Safe Verdict Card (when 0 additives found after scan) */}
      {hasScanned && results.length === 0 && !isScanning && !scanError && (
        <div className="verdict-card verdict-card-safe">
          <div className="verdict-main">
            <div className="verdict-circle verdict-circle-safe">0/6</div>
            <div className="verdict-info">
              <div className="verdict-title">{t.verdictSafe}</div>
              <div className="verdict-desc">{t.noAdditivesFound}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleReset}
            className="btn-icon"
            title={t.newScan}
          >
            <RotateCcw size={18} />
          </button>
        </div>
      )}

      {/* Collapsible Extracted Label Text Drawer */}
      {extractedText && (
        <div className="extracted-text-drawer">
          <button
            type="button"
            className="extracted-text-toggle"
            onClick={() => setIsTextExpanded(!isTextExpanded)}
          >
            <span className="extracted-text-label">
              🏷️ {t.extractedLabelText} ({extractedText.split(/\s+/).filter(Boolean).length}{' '}
              {t.wordsCount})
            </span>
            <span className="extracted-text-chevron">
              {isTextExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </span>
          </button>
          {isTextExpanded && (
            <div className="extracted-text-content">
              <p>"{extractedText}"</p>
            </div>
          )}
        </div>
      )}

      {/* Modern Filtered & Expandable Results Breakdown */}
      {results.length > 0 && (
        <div className="results-container">
          <div className="results-toolbar">
            <div className="filter-chips">
              <button
                type="button"
                className={`filter-chip ${filterRisk === 'all' ? 'active' : ''}`}
                onClick={() => setFilterRisk('all')}
              >
                {t.filterAll} ({results.length})
              </button>
              {riskyCount > 0 && (
                <button
                  type="button"
                  className={`filter-chip filter-chip-risky ${filterRisk === 'risky' ? 'active' : ''}`}
                  onClick={() => setFilterRisk('risky')}
                >
                  🔴 {t.filterRisky} ({riskyCount})
                </button>
              )}
              {moderateCount > 0 && (
                <button
                  type="button"
                  className={`filter-chip filter-chip-moderate ${filterRisk === 'moderate' ? 'active' : ''}`}
                  onClick={() => setFilterRisk('moderate')}
                >
                  🟡 {t.filterModerate} ({moderateCount})
                </button>
              )}
              {safeCount > 0 && (
                <button
                  type="button"
                  className={`filter-chip filter-chip-safe ${filterRisk === 'safe' ? 'active' : ''}`}
                  onClick={() => setFilterRisk('safe')}
                >
                  🟢 {t.filterSafe} ({safeCount})
                </button>
              )}
            </div>

            {results.length > 1 && (
              <div className="toolbar-actions">
                <button
                  type="button"
                  className="toolbar-btn"
                  onClick={toggleAllExpanded}
                  title={allFilteredExpanded ? t.collapseAll : t.expandAll}
                >
                  {allFilteredExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  <span>{allFilteredExpanded ? t.collapseAll : t.expandAll}</span>
                </button>
              </div>
            )}
          </div>

          {/* Quick search input if 3+ items */}
          {results.length >= 3 && (
            <div className="results-search-wrap">
              <Search size={14} className="search-icon" />
              <input
                type="text"
                className="results-search-input"
                placeholder={t.searchPlaceholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  type="button"
                  className="search-clear-btn"
                  onClick={() => setSearchQuery('')}
                >
                  <X size={14} />
                </button>
              )}
            </div>
          )}

          {filteredResults.length === 0 ? (
            <div className="no-filter-results">
              <p>{t.noFilterResults}</p>
            </div>
          ) : (
            filteredResults.map((item, index) => {
              const cardKey = `${item.id}-${index}`;
              const isExpanded = !!expandedIds[cardKey];
              const dbItem =
                item.matchedDb ||
                eNumbersData.find((d) => d.id?.toUpperCase() === (item.id || '').toUpperCase());
              const displayName = getLocalizedAdditiveName(dbItem, item.name, lang);

              return (
                <div
                  key={cardKey}
                  className={`ingredient-card rating-${item.rating} ${isExpanded ? 'expanded' : 'collapsed'}`}
                >
                  <div
                    className="card-header-clickable"
                    onClick={() => toggleExpand(cardKey)}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="card-left">
                      <span className="card-risk-icon">
                        {item.rating >= 4 ? (
                          <AlertTriangle size={18} color="var(--rating-5)" />
                        ) : item.rating <= 2 ? (
                          <CheckCircle size={18} color="var(--rating-1)" />
                        ) : (
                          <Info size={18} color="var(--rating-3)" />
                        )}
                      </span>
                      <div className="card-title-group">
                        <span className="card-title">
                          {item.id && item.id !== 'N/A' && (
                            <strong className="card-code">{item.id}</strong>
                          )}
                          <span className="card-name">{displayName}</span>
                        </span>
                        {item.category && (
                          <span className="card-category-inline">{item.category}</span>
                        )}
                      </div>
                    </div>

                    <div className="card-right">
                      <span className={`badge badge-${item.rating}`}>
                        {item.rating}/6
                      </span>
                      <span className="card-chevron">
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </span>
                    </div>
                  </div>

                  {/* Summary teaser when collapsed */}
                  {!isExpanded && item.rating >= 4 && item.reason && (
                    <div className="card-collapsed-teaser">
                      <span className="teaser-dot" />
                      <span className="teaser-text">{item.reason}</span>
                    </div>
                  )}

                  {/* Expandable Accordion Body */}
                  {isExpanded && (
                    <div className="card-expanded-body">
                      {item.reason && (
                        <div className="card-reason">
                          <strong>{t.whyCare}:</strong> {item.reason}
                        </div>
                      )}

                      {item.description && item.description !== item.reason && (
                        <p className="card-desc">{item.description}</p>
                      )}

                      <div className="card-meta">
                        {item.category && (
                          <span className="card-meta-item">
                            {t.category}: <em>{item.category}</em>
                          </span>
                        )}
                        {item.original_text && (
                          <span className="card-meta-item">
                            {t.originalText}: <em>"{item.original_text}"</em>
                          </span>
                        )}
                        <span className="card-meta-item card-meta-level">
                          {t.riskLevels[item.rating] || ''}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Empty State */}
      {results.length === 0 && inputText && !isScanning && !hasScanned && (
        <div className="empty-state">
          <AlertCircle size={28} style={{ marginBottom: '8px', opacity: 0.6 }} />
          <p>{t.noAdditivesFound}</p>
        </div>
      )}

      {/* Lightweight Full Image Zoom Modal */}
      {isPhotoModalOpen && photoPreview && (
        <div className="modal-overlay" onClick={() => setIsPhotoModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{t.extractedLabelText}</span>
              <button
                type="button"
                className="modal-close"
                onClick={() => setIsPhotoModalOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
            <img src={photoPreview} alt="Full label" className="modal-image" />
          </div>
        </div>
      )}
    </>
  );
}
