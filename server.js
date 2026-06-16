const express = require('express');
const cors = require('cors');
const https = require('https');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const GOOGLE_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1hPLCd4ZPG1BrSELile63Mb2ftaJl9Ts2TCH5QvxrFgY/gviz/tq?tqx=out:json';

// In-memory Cache structure
let cache = {
  data: null,
  lastUpdated: 0,
  ttl: 5 * 60 * 1000 // 5 minutes in milliseconds
};

// Helper function to fetch data from Google Sheet
function fetchGoogleSheetData() {
  return new Promise((resolve, reject) => {
    https.get(GOOGLE_SHEET_URL, (res) => {
      let body = '';

      if (res.statusCode !== 200) {
        return reject(new Error(`Failed to fetch Google Sheet, Status Code: ${res.statusCode}`));
      }

      res.on('data', (chunk) => {
        body += chunk;
      });

      res.on('end', () => {
        try {
          // Parse the gviz callback string
          const jsonStart = body.indexOf('{');
          const jsonEnd = body.lastIndexOf('}');
          if (jsonStart === -1 || jsonEnd === -1) {
            return reject(new Error('Invalid Google Sheet visualization format'));
          }

          const jsonString = body.substring(jsonStart, jsonEnd + 1);
          const parsed = JSON.parse(jsonString);

          // Extract columns and rows
          const rows = parsed.table.rows;
          
          // Map into a clean document structure
          const documents = rows.map(row => {
            const cells = row.c;
            return {
              fileName: cells[0] ? cells[0].v : '',
              mainMission: cells[1] ? cells[1].v : '',
              subMission: cells[2] ? cells[2].v : '',
              summary: cells[3] ? cells[3].v : '',
              link: cells[4] ? cells[4].v : ''
            };
          }).filter(doc => doc.fileName && doc.fileName.trim() !== '');

          resolve(documents);
        } catch (err) {
          reject(err);
        }
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

// REST API endpoint to retrieve documents
app.get('/api/documents', async (req, res) => {
  const forceRefresh = req.query.refresh === 'true';
  const now = Date.now();

  // Return cached data if valid and no forced refresh
  if (cache.data && (now - cache.lastUpdated < cache.ttl) && !forceRefresh) {
    return res.json({
      success: true,
      source: 'cache',
      lastUpdated: new Date(cache.lastUpdated).toISOString(),
      data: cache.data
    });
  }

  try {
    const documents = await fetchGoogleSheetData();
    
    // Update Cache
    cache.data = documents;
    cache.lastUpdated = now;

    res.json({
      success: true,
      source: 'live',
      lastUpdated: new Date(now).toISOString(),
      data: documents
    });
  } catch (error) {
    console.error('Error fetching Google Sheet data:', error.message);
    
    // Fallback to cache if request fails but we have stale cache
    if (cache.data) {
      return res.json({
        success: true,
        source: 'stale-cache',
        lastUpdated: new Date(cache.lastUpdated).toISOString(),
        error: error.message,
        data: cache.data
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to retrieve data from Google Sheet',
      error: error.message
    });
  }
});

// Fallback to index.html for SPA-like navigation (if needed)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
