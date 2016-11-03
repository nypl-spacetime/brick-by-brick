# <img src="bricks.gif"/> Space/Time Directory - brick-by-brick <img src="bricks.gif"/>

Simple JSON API for small crowdsourcing apps, used in different [NYC Space/Time Directory](http://spacetime.nypl.org/) projects:

- https://github.com/nypl-spacetime/surveyor
- https://github.com/nypl-spacetime/label-fields
- https://github.com/nypl-spacetime/tagmap
- https://github.com/nypl-spacetime/select-landmark

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

## Adding collections and tasks

COMING SOON!

## API

### Tasks

- `GET /tasks`: get list of available tasks
- `GET /tasks/:task/items/random`: get random item for which task `:task` has not been completed by the user associated with the current session
  - `GET /tasks/:task/items/random?collection=a,b,c`: only get items from collections with IDs `a`, `b` or `c`

### Items

- `GET /items/:organizationId/:id`: get a single item, with organization `:organizationId` and ID `:id`
- `POST /items/:organizationId/:id`: send completed task for item with organization `:organizationId` and ID `:id`. POST data should be of the following form:

```js
{
  "taskId": "task ID",
  "data": {
    // JSON data
  },
  "step": "name_of_step", // OPTIONAL
  "stepIndex": 1 // OPTIONAL
}
```

Or, when the user wants to skip a an item:

```js
{
  "taskId": "task ID",
  "skipped": true,
  "step": "name_of_step", // OPTIONAL
  "stepIndex": 1 // OPTIONAL
}
```

### Submissions

- `GET /tasks/:taskId/submissions`: get *all* submissions for task `:taskId` for the user associated with the current session
- `GET /tasks/:taskId/submissions/count`: get the amount of submissions for task `:taskId` for the user associated with the current session
- `GET /tasks/:taskId/submissions/all`: get the first 1000 submissions for task `:taskId` (pagination will be added in a later version)
- `GET /tasks/:taskId/submissions/all.ndjson`: get *all* submissions for task `:taskId`

### Collections

- `GET /organizations/:organizationId/collections`: get all collections for organization `:organizationId`
- `GET /organizations/:organizationId/collections/:collection`: get single collection with organization `:organizationId` and collection `:collection`

### OAuth

- `GET /oauth`: get user information, and list of available OAuth providers
- Log in with different OAuth providers:
  - `GET /oauth/connect/google`
  - `GET /oauth/connect/github`
  - `GET /oauth/connect/twitter`
  - `GET /oauth/connect/facebook`
- `GET /oauth/disconnect`: Log out, start new session

## Heroku

1. `git clone` this repository
2. `cd` the new folder
3. `heroku create` a new application
4. `git push` the code to heroku (usually: `git push heroku master`)
