var R = require('ramda');
var express = require('express');
var cors = require('cors');
var jwt = require('jsonwebtoken');
var bodyParser = require('body-parser');
var geojsonhint = require('geojsonhint');
var turf = {
  centroid: require('turf-centroid')
};
var package = require('./package');
var app = express();
var pg = require('pg');

var collections = require('./data/collections.json');

if (!process.env.WHERE_PRIVATE_KEY) {
  console.error('Please set WHERE_PRIVATE_KEY environment variable!');
  process.exit(-1);
}

var KEY = process.env.WHERE_PRIVATE_KEY;

app.use(bodyParser.json());
app.use(cors({
  exposedHeaders: [
    'Content-Type',
    'Authorization'
  ],
  allowedHeaders: [
    'Content-Type',
    'Authorization'
  ]
}));

var PORT = process.env.PORT || 3000;

var items = {};
var uuids;

// Load collection items for each collection in collections.json
//   extent item data with UUID of collection itself
var collectionData = collections
  .filter(collection => !collection.exclude)
  .map(collection =>
    require(`./data/${collection.uuid}.json`)
      .map(item => R.merge(item, {collection: collection.uuid}))
  );

R.flatten(collectionData)
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
  step_index integer NOT NULL,
  completed boolean NOT NULL,
  date_created timestamp with time zone DEFAULT (current_timestamp at time zone 'UTC'),
  date_modified timestamp with time zone DEFAULT (current_timestamp at time zone 'UTC'),
  data jsonb,
  client jsonb,
  geometry json,
  centroid point,
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

function sendItem(req, res, uuid) {
  if (!(uuid && items[uuid])) {
    res.status(404).send({
      result: 'error',
      message: 'Not found'
    });
  } else {
    res.send(items[uuid]);
  }
}

function randomString() {
  var length = 32;
  var token = Math.round((Math.pow(36, length + 1) - Math.random() * Math.pow(36, length))).toString(36).slice(1);
  return token;
}

function checkOrCreateToken(req, res, next) {
  if (!req.headers.authorization) {
    var session = randomString();
    var token = jwt.sign({ session: session }, KEY);
    res.setHeader('authorization', token);
  } else {
    // TODO: check of 't goede jsonwebtoken is!
    res.setHeader('authorization', req.headers.authorization);
  }
  next();
}

function checkToken(req, res, next) {
  if (!req.headers.authorization) {
    res.status(401).send({
      result: 'error',
      message: 'Not authorized'
    });
  } else {
    var token = req.headers.authorization;
    jwt.verify(token, KEY, function(err, decoded) {
      if (err) {
        res.status(401).send({
          result: 'error',
          message: 'Not authorized'
        });
      } else {
        req.session = decoded.session;
        next();
      }
    });
  }
}

app.get('/items/random', checkOrCreateToken, function (req, res) {
  var uuid = uuids[Math.floor(Math.random() * uuids.length)];
  sendItem(req, res, uuid);
});

app.get('/items/:uuid', checkOrCreateToken, function (req, res) {
  var uuid = req.params.uuid;
  sendItem(req, res, uuid);
});

app.post('/items/:uuid', checkToken, function (req, res) {
  var row = {
    uuid: req.params.uuid,
    session: null,
    step: null,
    step_index: null,
    completed: null,
    data: null,
    client: null,
    geometry: null,
    centroid: null
  };

  // Check if UUID exists in available collections, return 404 otherwise
  if (!(row.uuid && items[row.uuid])) {
    res.status(404).send({
      result: 'error',
      message: 'Not found'
    });
    return;
  }

  // POST data should be GeoJSON feature (with optional geometry)
  //   properties should contain:
  //     - step
  //     - stepIndex
  //     - completed
  //   if properties.completed == true,
  //     properties.data should contain step data
  var feature = req.body;

  // Check if step and stepIndex are present in properties
  if (!(feature.properties.step && feature.properties.stepIndex >= 0)) {
    res.status(406).send({
      result: 'error',
      message: 'Feature should contain step and stepIndex'
    });
    return;
  }
  row.step = feature.properties.step;
  row.step_index = feature.properties.stepIndex;

  if (feature.properties.completed) {
    if (!feature.properties.data) {
      res.status(406).send({
        result: 'error',
        message: 'Completed steps should contain data'
      });
      return;
    }
    row.completed = true;
    row.data = JSON.stringify(feature.properties.data);
  } else {
    if (feature.properties.data || feature.properties.data) {
      res.status(406).send({
        result: 'error',
        message: 'Only completed steps should contain data or geometry'
      });
      return;
    }

    row.completed = false;
  }

  if (feature.geometry) {
    var geojsonErrors = geojsonhint.hint(feature).map(e => e.message);
    if (geojsonErrors.length > 0) {
      res.status(406).send({
        result: 'error',
        message: geojsonErrors.length === 1 ? geojsonErrors[0] : geojsonErrors
      });
      return;
    }
    row.geometry = JSON.stringify(feature.geometry);

    // Compute centroid of geometry
    var centroid = turf.centroid(feature.geometry);
    if (centroid) {
      row.centroid = centroid.geometry.coordinates.join(',');
    }
  }

  // Get session ID, checkToken function stores correct sessions in req.session
  row.session = req.session;

  // Get information about client
  var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  var client = {
    ip: ip
  };
  row.client = JSON.stringify(client);

  var columns = R.keys(row);
  var placeholders = Array.from(new Array(columns.length), (x, i) => i + 1).map(i => `$${i}`);
  var values = placeholders.join(', ');
  var query = `INSERT INTO locations (${columns.join(', ')})
VALUES (${values})
ON CONFLICT (uuid, session, step)
WHERE NOT completed
DO UPDATE SET
  step_index = EXCLUDED.step_index,
  completed = EXCLUDED.completed,
  date_modified = current_timestamp at time zone 'UTC',
  data = EXCLUDED.data,
  client = EXCLUDED.client,
  geometry = EXCLUDED.geometry,
  centroid = EXCLUDED.centroid
WHERE EXCLUDED.completed;`;

  executeQuery(query, R.values(row), function(err) {
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
  executeQuery(`SELECT * FROM locations WHERE completed`, null, function(err, rows) {
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
            completed: row.completed,
            url: 'http://digitalcollections.nypl.org/items/' + row.uuid,
            data: row.data
          },
          geometry: row.geometry
        }))
      });
    }
  });
});

app.get('/collections', function (req, res) {
  res.send(collections);
});

app.listen(PORT, function () {
  console.log(`NYPL Where API listening on PORT ${PORT}!`);
});
