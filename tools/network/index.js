const express = require('express');

const app = express();

const PORT = 8000;

app.engine('html', require('ejs').renderFile);
app.set('view engine', 'html');

app.get('/', (req, res) => {
  res.render(__dirname + '/index.html', {}, (err, html) => {
    const data = {
      "nodes": [
        { "address": "node0" },
        { "address": "node1" },
        { "address": "node2" },
        { "address": "node3" }
      ],
      "links": [
        { "source": 2, "target": 1, "weight": 1 },
        { "source": 0, "target": 2, "weight": 1 },
        { "source": 2, "target": 3, "weight": 1 }
      ]
    };
  html = html.replace(/{ \/\* replace this \*\/ };/g, JSON.stringify(data));
    res.send(html);
  });
});

app.listen(PORT, () => {
  console.log(`Listening at http://localhost:${PORT}`);
});
