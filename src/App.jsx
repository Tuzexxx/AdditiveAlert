import { useState, useRef, useEffect } from 'react';
import Tesseract from 'tesseract.js';
import { Camera, Search, AlertTriangle, CheckCircle, Info } from 'lucide-react';
import { supabase } from './supabaseClient';
import defaultENumbersData from './data/e-numbers.json';
import './index.css';

function App() {
  const [inputText, setInputText] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [results, setResults] = useState([]);
  const [eNumbersData, setENumbersData] = useState(defaultENumbersData);
  const fileInputRef = useRef(null);

  // Fetch dynamic data from Supabase on load
  useEffect(() => {
    const fetchAdditives = async () => {
      // 1. Try to load from localStorage first for instant offline speed
      const cached = localStorage.getItem('additivealert_db');
      if (cached) {
        setENumbersData(JSON.parse(cached));
      }

      // 2. Fetch fresh data from Supabase in background if online
      if (supabase) {
        try {
          const { data, error } = await supabase.from('additives').select('*');
          if (data && !error) {
            // Map db schema back to app format
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

  const handleTextChange = (e) => {
    setInputText(e.target.value);
  };

  const reportUnknownAdditive = async (scannedName) => {
    if (!supabase) return;
    try {
      await supabase.from('pending_additives').insert([{ scanned_name: scannedName }]);
    } catch (err) {
      console.error("Failed to report unknown additive", err);
    }
  };

  const extractENumbers = (text) => {
    const resultsArray = [];
    const textUpper = text.toUpperCase();
    
    // 1. Direct Regex for E-numbers (E100, E-100, E 100)
    const eRegex = /[Ee][-\s]?\d{3,4}[a-z]?/g;
    const eMatches = text.match(eRegex) || [];
    
    // Clean up matches to standard format: E100, E150d
    const eNumberMatches = [...new Set(eMatches.map(m => m.replace(/[-\s]/g, '').toUpperCase()))];
    
    eNumbersData.forEach(item => {
      const standardId = item.id.toUpperCase();
      const numOnlyId = standardId.startsWith('E') ? standardId.substring(1) : standardId;
      
      let found = false;
      
      // Match by exact E-number from regex
      if (eNumberMatches.includes(standardId)) {
         found = true;
      }
      
      // Look for the name in the text
      if (!found && item.name && item.name.length > 3) {
        if (textUpper.includes(item.name.toUpperCase())) {
          found = true;
        }
      }

      // Look for english name
      if (!found && item.englishName && item.englishName.length > 3) {
        if (textUpper.includes(item.englishName.toUpperCase())) {
          found = true;
        }
      }

      // Look for bare numbers in the text
      if (!found) {
         const numRegex = new RegExp(`\\b${numOnlyId}\\b`, 'g');
         if (numRegex.test(textUpper)) {
            found = true;
         }
      }
      
      if (found) {
        if (!resultsArray.find(r => r.id === item.id)) {
          resultsArray.push(item);
        }
      }
    });
    
    // Check if regex matched anything that wasn't found in DB
    eNumberMatches.forEach(eNum => {
      if (!resultsArray.find(r => r.id.toUpperCase() === eNum)) {
         resultsArray.push({ id: eNum, name: "Unknown Additive", rating: 3, description: "Not found in our database. Flagged for review." });
         reportUnknownAdditive(eNum); // Pushes to Supabase
      }
    });
    
    // If absolutely no E-numbers matched, but user typed something manually, report the whole string
    if (resultsArray.length === 0 && text.trim().length > 3 && !isScanning) {
       reportUnknownAdditive(text.trim());
    }
    
    setResults(resultsArray.sort((a, b) => b.rating - a.rating));
  };

  const handleScanClick = () => {
    if (inputText.trim()) {
      extractENumbers(inputText);
    } else {
      setResults([]);
    }
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsScanning(true);
    
    Tesseract.recognize(
      file,
      'eng',
      { logger: m => console.log(m) }
    ).then(({ data: { text } }) => {
      setInputText(text);
      extractENumbers(text);
      setIsScanning(false);
    }).catch(err => {
      console.error(err);
      setIsScanning(false);
      alert("Failed to scan image.");
    });
  };

  return (
    <div className="app-container">
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
            placeholder="Paste ingredients here or scan a photo of the label... (e.g. Water, Sugar, E211, E102)"
            value={inputText}
            onChange={handleTextChange}
          />
          
          <div className="btn-group">
            <button className="btn btn-secondary" onClick={() => fileInputRef.current.click()}>
              <Camera size={20} />
              Scan Photo
            </button>
            <input 
              type="file" 
              accept="image/*" 
              ref={fileInputRef} 
              style={{ display: 'none' }} 
              onChange={handleImageUpload} 
            />
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
            <span className="badge" style={{ background: 'rgba(255,255,255,0.1)' }}>
              {results.length} Found
            </span>
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
                <span className={`badge badge-${item.rating}`}>
                  Risk Level: {item.rating}/5
                </span>
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
    </div>
  );
}

export default App;
