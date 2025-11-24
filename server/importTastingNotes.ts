import { db } from './db';
import { tastingNotes } from '@shared/schema';
import * as fs from 'fs';
import * as path from 'path';

interface TastingNoteData {
  grape: string;
  region: string;
  appearance: any;
  nose: any;
  palate: any;
  quality_assessment: any;
}

async function importTastingNotes() {
  try {
    // Read the JSON file
    const jsonPath = path.join(process.cwd(), 'attached_assets', 'tasting_notes_1763992049220.json');
    const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    
    console.log(`Found ${jsonData.tasting_notes.length} tasting notes to import`);
    
    // Check if data already exists
    const existing = await db.select().from(tastingNotes).limit(1);
    if (existing.length > 0) {
      console.log('Tasting notes already imported, skipping...');
      return;
    }
    
    // Transform and insert data
    const notesToInsert = jsonData.tasting_notes.map((note: TastingNoteData) => ({
      grape: note.grape,
      region: note.region,
      appearance: note.appearance,
      nose: note.nose,
      palate: note.palate,
      qualityAssessment: note.quality_assessment,
    }));
    
    await db.insert(tastingNotes).values(notesToInsert);
    
    console.log(`Successfully imported ${notesToInsert.length} tasting notes`);
  } catch (error) {
    console.error('Error importing tasting notes:', error);
    throw error;
  }
}

export { importTastingNotes };

// Run import
importTastingNotes()
  .then(() => {
    console.log('Import complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Import failed:', error);
    process.exit(1);
  });
