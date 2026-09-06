import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load .env.local manually
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const jsonPath = path.join(__dirname, 'src', 'data', 'e-numbers.json');

const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

async function seedDatabase() {
  console.log(`Starting to seed ${data.length} additives with corrected scores...`);
  
  // Format data for Supabase
  const formattedData = data.map(item => ({
    id: item.id,
    name: item.name,
    czech_name: item.czechName || item.name,
    english_name: item.englishName || null,
    german_name: item.germanName || null,
    ferpotravina_score: item.ferpotravinaScore ?? 0,
    rating: item.rating,
    description: item.description || null
  }));

  // Batch insert in chunks of 100 to avoid limits
  const chunkSize = 100;
  for (let i = 0; i < formattedData.length; i += chunkSize) {
    const chunk = formattedData.slice(i, i + chunkSize);
    const { error } = await supabase.from('additives').upsert(chunk);
    
    if (error) {
      console.error(`Error inserting chunk ${i}:`, error);
    } else {
      console.log(`Successfully inserted chunk ${i} to ${i + chunk.length}`);
    }
  }

  console.log("Seeding complete!");
}

seedDatabase();
