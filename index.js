const express = require('express');
const { JWT } = require('google-auth-library');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

app.get('/debug', async (req, res) => {
  try {
    const credentials = {
      client_email: process.env.CLIENT_EMAIL,
      private_key: process.env.PRIVATE_KEY
    };
    
    console.log('Credentials loaded:', {
      hasClientEmail: !!credentials.client_email,
      hasPrivateKey: !!credentials.private_key,
      privateKeyStart: credentials.private_key?.substring(0, 27),
      privateKeyEnd: credentials.private_key?.substring(credentials.private_key.length - 25)
    });

    res.json({
      clientEmail: credentials.client_email,
      privateKeyExists: !!credentials.private_key,
      privateKeyStartsWith: credentials.private_key?.substring(0, 27),
      privateKeyEndsWith: credentials.private_key?.substring(credentials.private_key.length - 25)
    });
  } catch (error) {
    console.error('Debug endpoint error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/token', async (req, res) => {
  try {
    const credentials = {
      client_email: process.env.CLIENT_EMAIL,
      private_key: process.env.PRIVATE_KEY
    };

    const client = new JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
    });

    const token = await client.getAccessToken();
    res.json({ access_token: token.token });
  } catch (error) {
    console.error('Token error:', error);
    res.status(500).json({ 
      error: 'Failed to get access token',
      details: error.message 
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});