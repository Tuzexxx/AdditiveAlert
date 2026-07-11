import { useState, useRef, useEffect } from 'react';
import Tesseract from 'tesseract.js';
import { Camera, Search, AlertTriangle, CheckCircle, Info } from 'lucide-react';
import { supabase } from '../supabaseClient';
import defaultENumbersData from '../data/e-numbers.json';

export default function Scanner() {
  const [inputText, setInputText] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [results, setResults] = useState([]);
  const [eNumbersData, setENumbersData] = useState(defaultENumbersData);
  const [session, setSession] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));

    const fetchAdditives = async () => {
      const cached = localStorage.getItem('additivealert_db');
      if (cached) setENumbersData(JSON.parse(cached));

      if (supabase) {
        try {
          const { data, error } = await supabase.from('additives').select('*');
          if (data && !error) {
            const mappedData = data.map(item => ({
              id: item.id,
              name: item.name,
              englishName: item.english_name,
              rating: item.rating,
              description: item.description
            }));
            setENumbersData(mappedData);
            localStorage.setItem('additivealert_db', JSON.stringify(mappedData));
          }
        } catch (err) {
          console.error("Failed to sync database:", err);
        }
      }
    };
    fetchAdditives();
  }, []);

  const reportUnknownAdditive = async (scannedName) => {
    if (!supabase) return;
    try {
      await supabase.from('pending_additives').insert([{ scanned_name: scannedName }]);
    } catch (err) {
      console.error("Failed to report", err);
    }
  };

  const saveScanHistory = async (ingredient) => {
    if (!session || !supabase) return;
    try {
      await supabase.from('scan_history').insert([{
        user_id: session.user.id,
        ingredient_name: ingredient.name,
        e_number: ingredient.id,
        rating: ingredient.rating,
        risk_level: ingredient.rating >= 4 ? 'High' : ingredient.rating <= 2 ? 'Low' : 'Medium'
      }]);
    } catch (err) {
      console.error("Failed to save history", err);
    }
  };

  const extractENumbers = (text) => {
    const resultsArray = [];
    const textUpper = text.toUpperCase();
    
    const eRegex = /[Ee][-\s]?\d{3,4}[a-z]?/g;
    const eMatches = text.match(eRegex) || [];
    const eNumberMatches = [...new Set(eMatches.map(m => m.replace(/[-\s]/g, '').toUpperCase()))];
    
    eNumbersData.forEach(item => {
      const standardId = item.id.toUpperCase();
      const numOnlyId = standardId.startsWith('E') ? standardId.substring(1) : standardId;
      
      let found = false;
      if (eNumberMatches.includes(standardId)) found = true;
      if (!found && item.name?.length > 3 && textUpper.includes(item.name.toUpperCase())) found = true;
      if (!found && item.englishName?.length > 3 && textUpper.includes(item.englishName.toUpperCase())) found = true;
      if (!found) {
         const numRegex = new RegExp(`\\b${numOnlyId}\\b`, 'g');
         if (numRegex.test(textUpper)) found = true;
      }
      
      if (found && !resultsArray.find(r => r.id === item.id)) {
        resultsArray.push(item);
        saveScanHistory(item);
      }
    });
    
    eNumberMatches.forEach(eNum => {
      if (!resultsArray.find(r => r.id.toUpperCase() === eNum)) {
         const unknownItem = { id: eNum, name: "Unknown Additive", rating: 3, description: "Not found in our database. Flagged for review." };
         resultsArray.push(unknownItem);
         reportUnknownAdditive(eNum);
         saveScanHistory(unknownItem);
      }
    });
    
    if (resultsArray.length === 0 && text.trim().length > 3 && !isScanning) {
       reportUnknownAdditive(text.trim());
    }
    
    setResults(resultsArray.sort((a, b) => b.rating - a.rating));
  };

  const handleScanClick = () => {
    if (inputText.trim()) extractENumbers(inputText);
    else setResults([]);
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsScanning(true);
    Tesseract.recognize(file, 'eng', { logger: m => console.log(m) })
      .then(({ data: { text } }) => {
        setInputText(text);
        extractENumbers(text);
        setIsScanning(false);
      })
      .catch(err => {
        console.error(err);
        setIsScanning(false);
        alert("Failed to scan image.");
      });
  };

  return (
    <>
      <header className="header">
        <h1>AdditiveAlert</h1>
        <p>Know what's in your food. Scan ingredients instantly.</p>
      </header>
      <div className="glass-panel">
        {isScanning && (
          <div className="upload-overlay">
            <div className="loader"></div>
            <p>Scanning ingredients...</p>
          </div>
        )}
        <div className="input-group">
          <textarea
            className="textarea-input"
            placeholder="Paste ingredients here or scan a photo of the label..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
          />
          <div className="btn-group">
            <button className="btn btn-secondary" onClick={() => fileInputRef.current.click()}>
              <Camera size={20} />
              Scan Photo
            </button>
            <input type="file" accept="image/*" ref={fileInputRef} style={{ display: 'none' }} onChange={handleImageUpload} />
            <button className="btn btn-primary" onClick={handleScanClick}>
              <Search size={20} />
              Analyze
            </button>
          </div>
        </div>
      </div>
      {results.length > 0 && (
        <div className="results-container">
          <div className="results-header">
            <span>Analysis Results</span>
            <span className="badge" style={{ background: 'rgba(255,255,255,0.1)' }}>{results.length} Found</span>
          </div>
          {results.map((item, index) => (
            <div key={index} className={`ingredient-card rating-${item.rating}`}>
              <div className="card-header">
                <span className="card-title">
                  {item.rating >= 4 ? <AlertTriangle size={18} color="var(--rating-5)" /> : 
                   item.rating <= 2 ? <CheckCircle size={18} color="var(--rating-1)" /> : 
                   <Info size={18} color="var(--rating-3)" />}
                  {item.id} - {item.name}
                </span>
                <span className={`badge badge-${item.rating}`}>Risk Level: {item.rating}/5</span>
              </div>
              <p className="card-desc">{item.description}</p>
            </div>
          ))}
        </div>
      )}
      {results.length === 0 && inputText && !isScanning && (
        <div className="empty-state">
          <p>No E-numbers detected. Try scanning another label.</p>
        </div>
      )}
    </>
  );
}
