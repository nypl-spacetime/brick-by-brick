# NYPL Labs - Where?

1. `git clone` this repository
2. `cd` the new folder
3. `heroku create` a new application
4. `git push` the code to heroku (usually: `git push heroku master`)

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

## Collections

Where? currently currently only includes items from the collection [The Eno collection of New York City views](http://digitalcollections.nypl.org/collections/the-eno-collection-of-new-york-city-views#/?tab=about).

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
