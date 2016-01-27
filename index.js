var R = require('ramda');
var express = require('express');
var cors = require('cors');
var bodyParser = require('body-parser')
var package = require('./package');
var app = express();
var pg = require('pg');

app.use(bodyParser.json());
app.use(cors());

var pgConString = "postgres://postgres:postgres@localhost/where";

// CREATE TABLE public.locations
// (
//   uuid text NOT NULL,
//   session text NOT NULL,
//   step text NOT NULL,
//   properties json,
//   geometry geometry,
//   CONSTRAINT locations_pkey PRIMARY KEY (uuid, session, step)
// )
// WITH (
//   OIDS=FALSE
// );

var PORT = process.env.PORT || 3000;

var uuid = '22f5f390-c5f0-012f-2796-58d385a7bc34';
collectionByUuid = {};
var collection = require(`./data/${uuid}.json`)
    .filter(function(item) {
      return item.imageLink;
    })
    .map(function(item) {
      item.imageLink = item.imageLink.filter(function(imageLink) {
        return imageLink.includes('&t=w&');
      })[0];

      collectionByUuid[item.uuid] = item;
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

app.get('/items/:uuid', function (req, res) {
  var uuid = req.params.uuid;
  if (!collectionByUuid[uuid]) {
    res.status(404).send({
      result: 'error',
      message: 'Not found'
    });
  } else {
    res.send(collectionByUuid[uuid]);
  }
});

app.get('/items/random', function (req, res) {
  res.send(collection[Math.floor(Math.random() * collection.length)]);
});

app.post('/items/:uuid', function (req, res) {
  var uuid = req.params.uuid;

  if (!collectionByUuid[uuid]) {
    res.status(404).send({
      result: 'error',
      message: 'Not found'
    });
    return;
  }

  // TODO: check if req.body is GeoJSON
  var session = 1;

  var data = {
    uuid: req.params.uuid,
    session: session,
    step: req.body.step,
    properties: JSON.stringify(req.body.feature.properties),
    geometry: JSON.stringify(req.body.feature.geometry)
    // TODO:add  bounding box?!
  };

  // TODO: do upsert - http://www.the-art-of-web.com/sql/upsert/

  var keys = R.keys(data);
  var placeholders = Array.from(new Array(keys.length), (x, i) => i + 1).map(i => `$${i}`);

  pg.connect(pgConString, function(err, client, done) {
    if (err) {
      res.status(500).send({
        result: 'error',
        message: err.message
      });
    } else {
      client.query(`INSERT INTO locations (${keys.join(', ')}) VALUES (${placeholders.join(', ')})`, R.values(data), function(err, result) {
        pgDone();

        if (err) {
          res.status(500).send({
            result: 'error',
            message: err.message
          });
        } else {
          res.send({
            result: 'success'
          });
        }
      });
    }
  });
});

app.get('/locations', function (req, res) {
  pg.connect(pgConString, function(err, client, done) {
    if (err) {
      res.status(500).send({
        result: 'error',
        message: err.message
      });
    } else {
      client.query(`SELECT * FROM locations`, function(err, result) {
        if (err) {
          res.status(500).send({
            result: 'error',
            message: err.message
          });
        } else {
          res.send({
            type: 'FeatureCollection',
            features: result.rows.map(row => ({
              type: 'Feature',
              properties: {
                uuid: row.uuid,
                step: row.step,
                url: 'http://digitalcollections.nypl.org/items/' + row.uuid
              },
              geometry: row.geometry
            }))
          });
        }
      });
    }
  });
});

app.listen(PORT, function () {
  console.log(`NYPL Where API listening on PORT ${PORT}!`);
});
