var express = require('express');
var cors = require('cors');
var bodyParser = require('body-parser')
var package = require('./package');
var app = express();

app.use(bodyParser.json());
app.use(cors());

var PORT = process.env.PORT || 3000;

var uuid = '22f5f390-c5f0-012f-2796-58d385a7bc34';
var collection = require(`./data/${uuid}.json`)
    .filter(function(item) {
      return item.imageLink;
    })
    .map(function(item) {
      item.imageLink = item.imageLink.filter(function(imageLink) {
        return imageLink.includes('&t=w&');
      })[0];
      return item;
    });


app.get('/', function (req, res) {
  res.send({
    title: package.description,
    version: package.version
  });
});

app.get('/items', function (req, res) {
  res.send(collection);
});

app.get('/items/random', function (req, res) {
  res.send(collection[Math.floor(Math.random() * collection.length)]);
});

app.post('/items/:uuid', function (req, res) {
  console.log('uuid', req.params.uuid);
  console.log('feature', req.body);

  res.send({
    result: 'success'
  });
});

app.listen(PORT, function () {
  console.log(`NYPL Where API listening on PORT ${PORT}!`);
});
