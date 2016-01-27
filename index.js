var R = require('ramda');
var express = require('express');
var cors = require('cors');
var bodyParser = require('body-parser');
var geojsonhint = require('geojsonhint');
var package = require('./package');
var app = express();
var pg = require('pg');

app.use(bodyParser.json());
app.use(cors());

var PORT = process.env.PORT || 3000;

var items = {};
var uuids;
var collections = [
  '22f5f390-c5f0-012f-2796-58d385a7bc34'
];

R.flatten(collections.map(uuid => require(`./data/${uuid}.json`)))
  .filter(function(item) {
    return item.imageLink;
  })
  .forEach(function(item) {
    item.imageLink = item.imageLink.filter(function(imageLink) {
      return imageLink.includes('&t=w&');
    })[0];

    items[item.uuid] = item;
  });

uuids = R.keys(items);

// https://devcenter.heroku.com/articles/getting-started-with-nodejs#provision-a-database
var pgConString = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost/where';
function executeQuery(query, values, callback) {
  pg.connect(pgConString, function(err, client, done) {
    if (err) {
      callback(err);
    } else {
      client.query(query, values, function(err, result) {
        done();
        if (err) {
          callback(err);
        } else {
          callback(null, result.rows);
        }
      });
    }
  });
}

var tableName = 'locations';

var tableExists = `SELECT COUNT(*)
  FROM pg_catalog.pg_tables
  WHERE schemaname = 'public'
  AND tablename  = '${tableName}'`;

var createTable = `CREATE TABLE public.${tableName} (
  uuid text NOT NULL,
  session text NOT NULL,
  step text NOT NULL,
  properties json,
  geometry json,
  CONSTRAINT locations_pkey PRIMARY KEY (uuid, session, step)
)`;

executeQuery(tableExists, null, function(err, rows) {
  if (err) {
    console.error('Error connecting to database:', err.message);
    process.exit(-1);
  } else {
    if (!(rows && rows[0].count === '1')) {
      console.log(`Table "${tableName}" does not exist - creating table...`);
      executeQuery(createTable, null, function(err) {
        if (err) {
          console.error('Error creating table:', err.message);
          process.exit(-1);
        }
      });
    }
  }
});

app.get('/', function (req, res) {
  res.send({
    title: package.description,
    version: package.version
  });
});

app.get('/items', function (req, res) {
  res.send(R.values(items));
});

app.get('/items/random', function (req, res) {
  res.send(items[uuids[Math.floor(Math.random() * uuids.length)]]);
});

app.get('/items/:uuid', function (req, res) {
  var uuid = req.params.uuid;
  if (!items[uuid]) {
    res.status(404).send({
      result: 'error',
      message: 'Not found'
    });
  } else {
    res.send(items[uuid]);
  }
});

app.post('/items/:uuid', function (req, res) {
  var uuid = req.params.uuid;

  if (!(uuid && items[uuid])) {
    res.status(404).send({
      result: 'error',
      message: 'Not found'
    });
    return;
  }

  var geojsonErrors = geojsonhint.hint(req.body.feature).map(e => e.message);
  if (geojsonErrors.length > 0) {
    res.status(406).send({
      result: 'error',
      message: geojsonErrors.length === 1 ? geojsonErrors[0] : geojsonErrors
    });
    return;
  }

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

  executeQuery(`INSERT INTO locations (${keys.join(', ')}) VALUES (${placeholders.join(', ')})`, R.values(data), function(err) {
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
});

app.get('/locations', function (req, res) {
  executeQuery(`SELECT * FROM locations`, null, function(err, rows) {
    if (err) {
      res.status(500).send({
        result: 'error',
        message: err.message
      });
    } else {
      res.send({
        type: 'FeatureCollection',
        features: rows.map(row => ({
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
});

app.listen(PORT, function () {
  console.log(`NYPL Where API listening on PORT ${PORT}!`);
});
