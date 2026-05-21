require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const Tesseract = require('tesseract.js');
const axios = require('axios');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ---------------- FILE UPLOAD ----------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) =>
    cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// ---------------- DATABASE ----------------
let communityDB = {};
let stateReports = {};

let reportCount = {
  total: 0,
  fake: 0,
  genuine: 0
};

// ---------------- VERIFIED CDSCO (MOCK) ----------------
const verifiedDB = {
  "PARACETAMOL": { status: "genuine", manufacturer: "Sun Pharma" },
  "AMOXICILLIN": { status: "genuine", manufacturer: "Cipla" },
  "AZITHROMYCIN": { status: "genuine", manufacturer: "Sun Pharma" },
  "IBUPROFEN": { status: "genuine", manufacturer: "Dr Reddy" },
  "METFORMIN": { status: "genuine", manufacturer: "Glenmark" },
  "CETIRIZINE": { status: "genuine", manufacturer: "Zydus" },
  "PANTOPRAZOLE": { status: "genuine", manufacturer: "Torrent" },
  "OMEPRAZOLE": { status: "genuine", manufacturer: "Cipla" },
  "DOLO650": { status: "genuine", manufacturer: "Micro Labs" },
  "CROCIN": { status: "genuine", manufacturer: "GSK" },
  "AUGMENTIN": { status: "genuine", manufacturer: "GSK" },
  "ATORVASTATIN": { status: "genuine", manufacturer: "Sun Pharma" },
  "LOSARTAN": { status: "genuine", manufacturer: "Torrent" },
  "TELMISARTAN": { status: "genuine", manufacturer: "Glenmark" },
  "AMLODIPINE": { status: "genuine", manufacturer: "Cipla" },
  "CLAVULANIC": { status: "genuine", manufacturer: "GSK" },
  "LEVOCETIRIZINE": { status: "genuine", manufacturer: "Zydus" },
  "RANITIDINE": { status: "genuine", manufacturer: "Sun Pharma" },
  "DOMPERIDONE": { status: "genuine", manufacturer: "Cipla" },
  "ONDANSETRON": { status: "genuine", manufacturer: "Dr Reddy" },
  "GLIMEPIRIDE": { status: "genuine", manufacturer: "Glenmark" },
  "GLICLAZIDE": { status: "genuine", manufacturer: "Torrent" },
  "INSULIN": { status: "genuine", manufacturer: "Novo Nordisk" },
  "VITAMINC": { status: "genuine", manufacturer: "Zydus" },
  "VITAMIND3": { status: "genuine", manufacturer: "Cipla" },
  "FERROUS": { status: "genuine", manufacturer: "Sun Pharma" },
  "FOLICACID": { status: "genuine", manufacturer: "Zydus" },
  "MULTIVITAMIN": { status: "genuine", manufacturer: "Himalaya" },
  "ALBENDAZOLE": { status: "genuine", manufacturer: "Glaxo" },
  "HYDROXYCHLOROQUINE": { status: "genuine", manufacturer: "Ipca" },
  "CHLOROQUINE": { status: "genuine", manufacturer: "Ipca" },
  "IVERMECTIN": { status: "genuine", manufacturer: "Sun Pharma" },
  "DICLOFENAC": { status: "genuine", manufacturer: "Novartis" },
  "NAPROXEN": { status: "genuine", manufacturer: "Dr Reddy" },
  "TRAMADOL": { status: "genuine", manufacturer: "Sun Pharma" },
  "CODEINE": { status: "genuine", manufacturer: "Pfizer" },
  "PREDNISOLONE": { status: "genuine", manufacturer: "Cipla" },
  "DEXAMETHASONE": { status: "genuine", manufacturer: "Zydus" },
  "BUDESONIDE": { status: "genuine", manufacturer: "Cipla" },
  "SALBUTAMOL": { status: "genuine", manufacturer: "GSK" }
};

// ---------------- OCR ----------------
async function extractTextFromImage(imagePath) {
  const result = await Tesseract.recognize(imagePath, 'eng');
  return result.data.text;
}

// ---------------- SCAN BY BATCH ----------------
app.post('/api/scan', (req, res) => {
  const { batch } = req.body;

  if (!batch) {
    return res.json({ error: 'Batch number required' });
  }

  const batchKey = batch.toUpperCase().trim();

  const result =
    communityDB[batchKey] ||
    verifiedDB[batchKey];

  if (result) {
    return res.json({
      found: true,
      source: communityDB[batchKey] ? 'community' : 'CDSCO',
      ...result
    });
  }

  return res.json({
    found: false,
    status: 'suspicious',
    name: 'Unknown Medicine',
    manufacturer: 'Not in database',
    batch,
    expiry: 'Cannot verify',
    hologram: 'Cannot verify',
    cdsco: 'Not Found',
    confidence: 45
  });
});

// ---------------- SCAN IMAGE ----------------
app.post('/api/scan-image', upload.single('medicine'), async (req, res) => {
  if (!req.file) {
    return res.json({ error: 'No image uploaded' });
  }

  try {
    const text = await extractTextFromImage(req.file.path);
    const cleanText = text.toUpperCase();

    console.log("OCR TEXT:", cleanText);

    // ---------------- CHECK CDSCO (verifiedDB) ----------------
    for (let key in verifiedDB) {
      if (cleanText.includes(key)) {
        return res.json({
          found: true,
          status: "genuine",
          name: key,
          manufacturer: verifiedDB[key].manufacturer,
          source: verifiedDB[key].source,
          confidence: 95
        });
      }
    }

    // ---------------- CHECK COMMUNITY DB ----------------
    for (let key in communityDB) {
      if (cleanText.includes(key)) {
        return res.json({
          found: true,
          status: communityDB[key].status,
          name: communityDB[key].name,
          manufacturer: communityDB[key].manufacturer,
          source: "community database",
          confidence: communityDB[key].confidence || 60
        });
      }
    }

    // ---------------- NOT FOUND ----------------
    return res.json({
      found: false,
      status: "unknown",
      name: "Not Found in CDSCO Database",
      message: "Medicine not matched in verified records",
      suggestion: "Please verify with pharmacy or official CDSCO source",
      googleSearch: `https://www.google.com/search?q=${encodeURIComponent(cleanText.slice(0, 50))} medicine india`,
      confidence: 40
    });

  } catch (err) {
    console.log("OCR ERROR:", err);
    return res.json({ error: "Image processing failed" });
  }
});


// ---------------- CHAT API ----------------
app.post('/api/chat', async (req, res) => {
  const { message } = req.body;

  if (!message) {
    return res.json({ reply: 'Please send a message!' });
  }

  try {
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'meta-llama/llama-3.1-8b-instruct',
        messages: [
          {
            role: 'system',
            content: `
You are a STRICT Indian Medical Safety AI.

RULES (must follow):
- Default language: English.
- If the user explicitly asks for Hindi, then reply in Hindi.
- Never mix English and Hindi in the same response.
- Never generate random words or broken sentences.
- Never invent medicine names or diseases.
- If unsure, reply: "I am not sure about this medicine."
- Keep response under 5 lines.
- Only give medicine safety, side effects, or verification advice.
- Do NOT generate fake lists or long explanations.
`
          },
          { role: 'user', content: message }
        ]
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENROUTER_KEY}`,
          'HTTP-Referer': 'http://localhost:3000',
          'X-Title': 'NakliDawai Detector'
        }
      }
    );

    return res.json({
      reply: response.data?.choices?.[0]?.message?.content || 'No response'
    });

  } catch (err) {
    console.log(err.message);
    return res.json({ reply: 'API error or network issue' });
  }
});

// ---------------- REPORT ----------------
app.post('/api/report', (req, res) => {
  const { batch, location, state, description } = req.body;

  reportCount.total++;

  if (state) {
    if (!stateReports[state]) stateReports[state] = 0;
    stateReports[state]++;
  }

  res.json({
    success: true,
    message: 'Report submitted: ' +
      Math.random().toString(36).substr(2, 9).toUpperCase()
  });
});

// ---------------- HOTSPOTS ----------------
app.get('/api/hotspots', (req, res) => {

  const hotspots = Object.keys(stateReports).map(state => {
    const reports = stateReports[state];
    const percent = Math.min(
      100,
      Math.floor((reports / reportCount.total) * 100)
    );

    return { state, reports, percent };
  });

  hotspots.sort((a, b) => b.reports - a.reports);

  res.json({
    hotspots,
    stats: {
      totalReports: reportCount.total,
      statesAffected: Object.keys(stateReports).length,
      resolved: Math.floor(reportCount.total * 0.6)
    }
  });
});

// ---------------- COMMUNITY ----------------
app.post('/api/community/add', (req, res) => {
  const { batch, name, manufacturer, status, location } = req.body;

  if (!batch || !name) {
    return res.json({ error: 'Batch and name required' });
  }

  communityDB[batch.toUpperCase()] = {
    status: status || 'suspicious',
    name,
    manufacturer: manufacturer || 'Community Reported',
    batch,
    expiry: 'Check packaging',
    hologram: 'Not verified',
    cdsco: 'Community Report',
    confidence: 55,
    reportedFrom: location,
    reportedAt: new Date().toISOString()
  };

  reportCount.total++;

  res.json({ success: true, message: 'Added to community DB' });
});

// ---------------- STATS ----------------
app.get('/api/stats', (req, res) => {
  res.json({
    ...reportCount,
    communityMedicines: Object.keys(communityDB).length,
    lastUpdated: new Date().toISOString()
  });
});

// ---------------- START SERVER ----------------
app.listen(PORT, () => {
  console.log(`NakliDawai running at http://localhost:${PORT}`);
  console.log('OpenRouter:', process.env.OPENROUTER_KEY ? 'Loaded' : 'Missing');
});
