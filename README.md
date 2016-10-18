# <img src="bricks.gif"/> Space/Time Directory - brick-by-brick <img src="bricks.gif"/>

Simple JSON API for small crowdsourcing apps, used in different [NYC Space/Time Directory](http://spacetime.nypl.org/) projects:

- https://github.com/nypl-spacetime/surveyor
- https://github.com/nypl-spacetime/label-fields
- https://github.com/nypl-spacetime/tagmap

## Installation & usage

First, clone the GitHub repository:

    git clone https://github.com/nypl-spacetime/brick-by-brick.git

Then, install all Node.js dependencies:

    cd brick-by-brick
    npm install

brick-by-brick needs a PostgreSQL database to store geotagged images. Make sure PostgreSQL is installed and is running. By default, the API uses the following [connection string](https://github.com/brianc/node-postgres/wiki/pg#parameters), but you can override this by setting the `DATABASE_URL` environment variable:

    export DATABASE_URL=postgres://postgres:postgres@localhost/brick-by-brick

### Database initialization

Before starting the API, you need to create the database mentioned in the connection string, and afterwards run the following two SQL files to create the necessary schemas, tables and indexes:

  - brick-by-brick tables: [`sql/tables.sql`](sql/tables.sql)
  - OAuth schema and tables: [`oauth-tables.sql`](https://github.com/nypl-spacetime/express-pg-oauth/blob/master/oauth-tables.sql)

Run the following two commands to initialize your database:

  - `psql brick-by-brick < sql/tables.sql`
  - `psql brick-by-brick < node_modules/express-pg-oauth/oauth-tables.sql`

### Configuration file

brick-by-brick needs a configuration file to run. You can provide the path to this configuration file by either using the `--config` command line option, or by setting the `BRICK_BY_BRICK_CONFIG` environment variable.

The configuration should have the following format:

```json
{
  "server": {
    "host": "brick-by-brick.dev",
    "secret": "secret-for-oauth-signing"
  },
  "database": {
    "url": "postgres://postgres:postgres@localhost/brick-by-brick",
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

To start brick-by-brick, run `index.js`:

    node index.js

Or, if you want to the API to restart when its code is changed, use [nodemon](https://github.com/remy/nodemon):

    nodemon index.js

The API listens on port 3011 by default, change this by setting the `PORT` environment variable.

## API

### Items

- `GET /items/:provider/:id`: get a single collection item, with provider `:provider` and ID `:id`
- `GET /items/random`: get random collection item which has not been geolocated by the user associated with the current session
- `POST /items/:provider/:id`: send new location of item with provider `:provider` and ID `:id`. POST data should be of the following form:

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

- `GET /collections`: get all collections brick-by-brick uses.

### OAuth

- `GET /oauth`: get user information, and list of available OAuth providers
- Log in with different OAuth providers:
  - `GET /oauth/connect/google`
  - `GET /oauth/connect/github`
  - `GET /oauth/connect/twitter`
  - `GET /oauth/connect/facebook`
- `GET /oauth`/disconnect: Log out, start new session

### Socket.IO

The brick-by-brick provides a [Socket.IO](http://socket.io/) which emits GeoJSON features for each geolocated item.

## Heroku

1. `git clone` this repository
2. `cd` the new folder
3. `heroku create` a new application
4. `git push` the code to heroku (usually: `git push heroku master`)
