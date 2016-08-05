CREATE TABLE public.collections (
  provider text NOT NULL,
  id text NOT NULL,
  title text NOT NULL,
  url text NOT NULL,
  CONSTRAINT collections_pkey PRIMARY KEY (provider, id)
);


CREATE TABLE public.items (
  provider text NOT NULL,
  id text NOT NULL,
  title text NOT NULL,
  url text NOT NULL,
  image_urls json NOT NULL,
  meta json,
  collection_id text NOT NULL,

  FOREIGN KEY (provider, collection_id) REFERENCES public.collections (provider, id) ON DELETE CASCADE,
  CONSTRAINT items_pkey PRIMARY KEY (provider, id)
);

CREATE TABLE public.submissions (
  item_provider text NOT NULL,
  item_id text NOT NULL,
  user_id int NOT NULL,
  step text NOT NULL,
  step_index integer NOT NULL,
  skipped boolean NOT NULL,
  date_created timestamp with time zone DEFAULT (current_timestamp at time zone 'UTC'),
  date_modified timestamp with time zone DEFAULT (current_timestamp at time zone 'UTC'),
  data jsonb,
  client jsonb,
  geometry json,
  centroid point,
  CONSTRAINT submissions_pkey PRIMARY KEY (item_provider, item_id, user_id, step)
  -- Don't create foreign keys on item_provider and item_id:
  --  even if the items are deleted from items table, the submissions should be kept in DB
);

CREATE INDEX submissions_skipped_user_id ON submissions (skipped, user_id);
CREATE INDEX submissions_user_id_provider_id_step_index ON submissions (user_id, item_provider, item_id, step_index);
