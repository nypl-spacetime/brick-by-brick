# NYPL Labs - Where? API

API for [NYPL Labs - Where?](https://github.com/nypl-spacetime/where), a tool for crowdsourced geolocating of items from the NYPL's [Digital Collections](http://digitalcollections.nypl.org/).

## Installation & Usage

First, clone the GitHub repository:

    git clone https://github.com/nypl-spacetime/where-api.git

Then, install all Node.js dependencies:

    cd where-api
    npm install

The Where API needs a PostgreSQL database to store geotagged images. Make sure PostgreSQL is installed and is running. By default, the API uses the following [connection string](https://github.com/brianc/node-postgres/wiki/pg#parameters), but you can override this by setting the `DATABASE_URL` environment variable:

    export DATABASE_URL=postgres://postgres:postgres@localhost/where

The API creates its tables when it's started for the first time, but it does not create a database; please make sure the database mentioned in the connection string (`where` by default) is created.

To fetch image metadata from NYPL's Digital Collections API, the Where API needs a valid API key. Sign up for a token on [api.repo.nypl.org](http://api.repo.nypl.org/), and set the `DIGITAL_COLLECTIONS_TOKEN` environment variable to hold this token:

    export DIGITAL_COLLECTIONS_TOKEN=123456789

The Where API uses [JSON Web Tokens](https://en.wikipedia.org/wiki/JSON_Web_Token) (JWT) to communicate with [Where browser clients](https://github.com/nypl-spacetime/where). JWT needs a private key for encryption, set the `WHERE_PRIVATE_KEY` environment variable to a random string of your choosing:

    export WHERE_PRIVATE_KEY=random_string

The API listens on port 3000 by default, change this by setting the `PORT` environment variable.

To start the Where API, run `index.js`:

    node index.js

Or, if you want to the API to restart when its code is changed, use [nodemon](https://github.com/remy/nodemon):

    nodemon index.js

## API

### Items

- `GET /items`: get all collection items
- `GET /items/:uuid`: get a single collection item, with UUID `:uuid`
- `GET /items/random`: get random collection item
- `POST /items/:uuid`: send new location of item with UUID `:uuid`. POST data should be of the following form:

```json
{
  "step": "stepId",
  "feature": {
    "type": "Feature",
    "properties": {

    },
    "geometry": "geojsonGeometry"
  }
}
```

POST example:

    curl -X POST -H 'content-type:application/json' -d '{"type":"Feature","properties":{},"geometry":{"type":"Point","coordinates":[ -79.062595,43.083056]}}' http://localhost:3000/items/5e66b3e8-c8d9-d471-e040-e00a180654d7

### Locations

- `GET /locations`: get all geolocated items

### Collections

- `GET /collections`: get all collections Where? uses.

The collections are loaded from [`collections.json`](data/collections.json). To exclude a collection in `collections.json`, add `"exclude": true`.

## Data

Install NYPL's [Digital Collections API Client](https://github.com/NYPL-publicdomain/api-client) (and obtain an API access token):

    npm install -g digital-collections

And, install [jq](https://stedolan.github.io/jq/):

    brew install jq

Then, download and parse a image collection:

```bash
digital-collections -u 22f5f390-c5f0-012f-2796-58d385a7bc34 | \
jq  '[.[] | {uuid: .uuid, title: .title, imageLink: .imageLinks.imageLink}]' > \
data/22f5f390-c5f0-012f-2796-58d385a7bc34.json
```

(Or run `./fetch.sh 22f5f390-c5f0-012f-2796-58d385a7bc34`!)

## Heroku

1. `git clone` this repository
2. `cd` the new folder
3. `heroku create` a new application
4. `git push` the code to heroku (usually: `git push heroku master`)
