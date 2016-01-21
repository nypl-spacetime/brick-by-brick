var express = require('express');
var app = express();

var port = 3000;

app.get('/', function (req, res) {
  res.send({
    title: 'Mr. Mauricio and his friends in a remote Wyoming river valley',
    uuid: '5e66b3e8-c898-d471-e040-e00a180654d7',
    url: 'http://images.nypl.org/index.php?id=1662550&t=w&download=1&suffix=5e66b3e8-c898-d471-e040-e00a180654d7.001'
  });
});

app.listen(port, function () {
  console.log(`NYPL Where API listening on port ${port}!`);
});
