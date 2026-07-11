const fs = require('fs');
const path = require('path');

const csvPath = path.join(__dirname, 'Ecka DB csv.csv');
const jsonPath = path.join(__dirname, 'src', 'data', 'e-numbers.json');

const csv = fs.readFileSync(csvPath, 'utf-8');
const lines = csv.split('\n');

const eNumbers = [];

// Skip header
for (let i = 1; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue;
  
  // Basic CSV parser to handle quotes
  const parts = [];
  let current = '';
  let inQuotes = false;
  
  for (let j = 0; j < line.length; j++) {
    const char = line[j];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      parts.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  parts.push(current);
  
  if (parts.length >= 6) {
    const eNumber = parts[0].trim();
    const czechName = parts[1].trim();
    const englishName = parts[2].trim();
    const germanName = parts[3].trim();
    const score = parseInt(parts[4], 10);
    const category = parts[5].trim();
    
    // Map score 0-6 to 1-5
    let rating = 1;
    if (score === 0) rating = 1;
    else if (score === 1) rating = 2;
    else if (score === 2) rating = 3;
    else if (score === 3) rating = 4;
    else if (score >= 4) rating = 5;
    
    eNumbers.push({
      id: eNumber.toUpperCase(), // Normalize to uppercase
      name: czechName || englishName,
      englishName: englishName,
      rating: rating,
      description: category
    });
  }
}

fs.writeFileSync(jsonPath, JSON.stringify(eNumbers, null, 2));
console.log(`Generated ${eNumbers.length} E-numbers.`);
