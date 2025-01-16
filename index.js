const express = require('express');
const { JWT } = require('google-auth-library');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Your service account credentials from the JSON file
const credentials = {
  client_email: process.env.CLIENT_EMAIL,
  private_key: process.env.PRIVATE_KEY
};

async function getAccessToken() {
  const client = new JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
  });

  const token = await client.getAccessToken();
  return token.token;
}

app.get('/token', async (req, res) => {
  try {
    const token = await getAccessToken();
    res.json({ access_token: token });
  } catch (error) {
    console.error('Error getting token:', error);
    res.status(500).json({ error: 'Failed to get access token' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});