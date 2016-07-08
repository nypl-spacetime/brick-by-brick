# Space/Time Directory - Surveyor API

API for [Space/Time Directory - Surveyor](https://github.com/nypl-spacetime/surveyor), a tool for crowdsourced geolocating of items from the NYPL's [Digital Collections](http://digitalcollections.nypl.org/).

## Installation & usage

First, clone the GitHub repository:

    git clone https://github.com/nypl-spacetime/surveyor-api.git

Then, install all Node.js dependencies:

    cd surveyor-api
    npm install

Surveyor API needs a PostgreSQL database to store geotagged images. Make sure PostgreSQL is installed and is running. By default, the API uses the following [connection string](https://github.com/brianc/node-postgres/wiki/pg#parameters), but you can override this by setting the `DATABASE_URL` environment variable:

    export DATABASE_URL=postgres://postgres:postgres@localhost/surveyor

### Database initialization

Before starting the API, you need to create the database mentioned in the connection string, and afterwards run the following two SQL files to create the necessary schemas, tables and indexes:

  - Surveyor API tables: [`surveyor-api-tables.sql`](surveyor-api-tables.sql)
  - OAuth schema and tables: [`oauth-tables.sql`](https://github.com/nypl-spacetime/express-pg-oauth/blob/master/oauth-tables.sql)

Run the following two commands to initialize your database:

  - `psql surveyor < surveyor-api-tables.sql`
  - `psql surveyor < node_modules/express-pg-oauth/oauth-tables.sql`

### Digital Collections API token

To fetch image metadata from NYPL's Digital Collections API, Surveyor API needs a valid API key. Sign up for a token on [api.repo.nypl.org](http://api.repo.nypl.org/), and set the `DIGITAL_COLLECTIONS_TOKEN` environment variable to hold this token:

    export DIGITAL_COLLECTIONS_TOKEN=123456789

### Configuration file

Surveyor API needs a configuration file to run. You can provide the path to this configuration file by either using the `--config` command line option, or by setting the `SURVEYOR_API_CONFIG` environment variable.

The configuration should have the following format:

```json
{
  "server": {
    "host": "surveyor-api.dev",
    "secret": "secret-for-oauth-signing"
  },
  "database": {
    "url": "postgres://postgres:postgres@localhost/surveyor",
  },
  "app": {
    "name": "Application name",
    "url": "http://application.domain/"
  },
  "twitter": {
    "key": "twitter_ket",
    "secret": "twitter_secret"
  },
  "facebook": {
    "key": "facebook_key",
    "secret": "facebook_secret"
  },
  "google": {
    "key": "google_key",
    "secret": "google_secret"
  },
  "github": {
    "key": "github_key",
    "secret": "github_secret"
  }
}
```

### Starting the API

To start Surveyor API, run `index.js`:

    node index.js

Or, if you want to the API to restart when its code is changed, use [nodemon](https://github.com/remy/nodemon):

    nodemon index.js

The API listens on port 3011 by default, change this by setting the `PORT` environment variable.

## API

### Items

- `GET /items/:uuid`: get a single collection item, with UUID `:uuid`
- `GET /items/random`: get random collection item which has not been geolocated by the user associated with the current session
- `POST /items/:uuid`: send new location of item with UUID `:uuid`. POST data should be of the following form:
- `GET /items/:uuid/mods`: get NYPL Digital Collections API MODS metadata for item with UUID `:uuid`

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

    curl -X POST -H 'content-type:application/json' -d '{"type":"Feature","properties":{},"geometry":{"type":"Point","coordinates":[ -79.062595,43.083056]}}' http://localhost:3011/items/5e66b3e8-c8d9-d471-e040-e00a180654d7

### Submissions

- `GET /submissions`: get all geolocated items for the user associated with the current session
- `GET /submissions/count`: get the amount of geolocated items for the user associated with the current session
- `GET /submissions/all`: get the first 1000 geolocated items (pagination will be added in a later version)

### Collections

- `GET /collections`: get all collections Surveyor API uses.

The collections are loaded from [`collections.json`](data/collections.json). To exclude a collection in `collections.json`, add `"exclude": true`.

### OAuth

- `GET /oauth`: get user information, and list of available OAuth providers
- Log in with different OAuth providers:
  - `GET /oauth/connect/google`
  - `GET /oauth/connect/github`
  - `GET /oauth/connect/twitter`
  - `GET /oauth/connect/facebook`
- `GET /oauth`/disconnect: Log out, start new session

### Socket.IO

The Surveryor API provides a [Socket.IO](http://socket.io/) which emits GeoJSON features for each geolocated item.

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
