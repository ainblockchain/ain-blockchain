const express = require('express');
const app = express();
const port = 3000;

app.use(express.json());
app.use((req, res, next) => {
  const method = req.method;
  const url = req.url;
  const status = res.statusCode;
  const log = `${method}:${url} ${status}`;
  console.log(log);
  next();
});

app.post('/trigger', (req, res) => {
  res.send('Triggered!');
  console.log(`Body: ${JSON.stringify(req.body, null, 2)}`);
});

app.listen(port, () => {
  console.log(`App listening at http://localhost:${port}`);
});
