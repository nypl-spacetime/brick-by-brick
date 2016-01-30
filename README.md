# NYPL Labs - Where? API

API for [NYPL Labs - Where?](https://github.com/nypl-spacetime/where), a tool for crowdsourced geolocating of items from the NYPL's [Digital Collections](http://digitalcollections.nypl.org/).

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
