import { useState, useRef } from 'react';
import Tesseract from 'tesseract.js';
import { Camera, Search, AlertTriangle, CheckCircle, Info } from 'lucide-react';
import eNumbersData from './data/e-numbers.json';
import './index.css';

function App() {
  const [inputText, setInputText] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [results, setResults] = useState([]);
  const fileInputRef = useRef(null);

  const handleTextChange = (e) => {
    setInputText(e.target.value);
  };

  const extractENumbers = (text) => {
    const results = [];
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

      // Look for bare numbers in the text if we can isolate them nicely
      // To avoid matching '100' in '100g', we use regex boundary
      if (!found) {
         const numRegex = new RegExp(`\\b${numOnlyId}\\b`, 'g');
         if (numRegex.test(textUpper)) {
            found = true;
         }
      }
      
      if (found) {
        if (!results.find(r => r.id === item.id)) {
          results.push(item);
        }
      }
    });
    
    // Check if regex matched anything that wasn't found in DB
    eNumberMatches.forEach(eNum => {
      if (!results.find(r => r.id.toUpperCase() === eNum)) {
         results.push({ id: eNum, name: "Unknown Additive", rating: 3, description: "Not found in our database. Consume with caution." });
      }
    });
    
    setResults(results.sort((a, b) => b.rating - a.rating));
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
