const express = require('express');

const app = express();

const PORT = 7000;

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

app.listen(PORT, () => {
  console.log(`Listening at http://localhost:${PORT}`);
});
