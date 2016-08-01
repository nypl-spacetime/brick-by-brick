CREATE TABLE public.collections (
  uuid text NOT NULL,
  title text NOT NULL,
  url text NOT NULL,
  CONSTRAINT collections_pkey PRIMARY KEY (uuid)
);

CREATE TABLE public.items (
  uuid text NOT NULL,
  title text NOT NULL,
  image_id text NOT NULL,
  image_link text NOT NULL,
  collection text REFERENCES public.collections (uuid) ON DELETE CASCADE,
  CONSTRAINT items_pkey PRIMARY KEY (uuid)
);

CREATE INDEX item_uuid ON items (uuid);

CREATE TABLE public.submissions (
  uuid text NOT NULL,
  user_id int NOT NULL,
  step text NOT NULL,
  step_index integer NOT NULL,
  skipped boolean NOT NULL,
  image_id text,
  date_created timestamp with time zone DEFAULT (current_timestamp at time zone 'UTC'),
  date_modified timestamp with time zone DEFAULT (current_timestamp at time zone 'UTC'),
  data jsonb,
  client jsonb,
  geometry json,
  centroid point,
  CONSTRAINT submissions_pkey PRIMARY KEY (uuid, user_id, step)
);

CREATE INDEX submissions_skipped_user_id ON submissions (skipped, user_id);
CREATE INDEX submissions_user_id_uuid_step_index ON submissions (user_id, uuid, step_index);
