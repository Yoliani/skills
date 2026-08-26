# HogQL reference

HogQL is PostHog's SQL, a ClickHouse dialect. `query.js` sends whatever you
write here to `POST /api/projects/:id/query/` as a `HogQLQuery`.

The live schema for a project is at `/data-management/database` in the UI, and
`query.js "select * from events limit 1"` shows the columns of any table.

## Tables

| Table | One row per | Key columns |
|-------|-------------|-------------|
| `events` | captured event | `uuid`, `event`, `properties`, `timestamp`, `distinct_id`, `session_id`, `person_id` |
| `persons` | person | `id`, `created_at`, `last_seen_at`, `properties`, `is_identified` |
| `sessions` | session | `session_id`, `distinct_id`, `$start_timestamp`, `$end_timestamp`, `$session_duration`, `$entry_current_url`, `$pageview_count`, `$is_bounce`, `$channel_type` |
| `session_replay_features` | recorded session | `session_id`, `min_first_timestamp`, `click_count`, `rage_click_count`, `console_error_count`, `network_failed_request_count` |
| `groups` | group (company, team) | `index`, `key`, `created_at`, `properties` |
| `query_log` | API query you ran | `event_time`, `query_id`, `name`, read rows and bytes |

Joins go through the IDs: `events.person_id = persons.id`, and
`events.session_id = sessions.session_id`.

## Reading properties

`properties` is stored as a JSON string, but dot and bracket notation read
through it directly. Identifiers must be literal at query time.

```sql
properties.$current_url                 -- PostHog's own properties carry a $
properties.plan_tier                    -- your custom properties do not
properties['$feature/new-checkout']     -- bracket notation for awkward keys
properties.cart.total                   -- nested JSON
person.properties.email                 -- person properties from the events table
```

Types default to `STRING`. Convert with `toFloat`, `toInt`, `toDate`,
`toString`, or the `JSONExtract*` family when you need dynamic key access.

## Time

Always bound the range. It is the single biggest lever on cost and on staying
under the 10 second execution cap.

```sql
where timestamp >= now() - interval 7 day
where timestamp >= toStartOfDay(now() - interval 1 day)
where dateDiff('minute', timestamp, now()) < 30
```

Bucketing: `toStartOfHour`, `toStartOfDay`, `toStartOfWeek`, `toStartOfMonth`,
`toHour`, `toDayOfWeek`.

## Functions worth knowing

- Conditionals: `if(cond, then, else)`, `multiIf(c1, t1, c2, t2, else)`
- Aggregations: `count()`, `countIf(cond)`, `sumIf(col, cond)`, `uniq()`,
  `uniqExact()`, `avg()`, `median()`, `quantile(0.95)(col)`
- Strings: `concat()`, `extract(haystack, pattern)`, `replaceOne()`, `like`,
  `match(value, regexp)`
- Arrays: `arrayJoin(JSONExtractArrayRaw(properties.$active_feature_flags ?? '[]'))`

## Recipes

Busiest events yesterday:

```sql
select event, count() as n
from events
where timestamp >= now() - interval 1 day
group by event order by n desc limit 20
```

Daily active users over a fortnight:

```sql
select toStartOfDay(timestamp) as day, uniq(person_id) as dau
from events
where timestamp >= now() - interval 14 day
group by day order by day
```

Exceptions grouped by type, which is the raw view behind error tracking issues:

```sql
select
  properties.$exception_types as types,
  count() as occurrences,
  uniq(person_id) as users,
  max(timestamp) as last_seen
from events
where event = '$exception' and timestamp >= now() - interval 7 day
group by types order by occurrences desc limit 20
```

Sessions that hit an exception, ready to paste into `list-recordings.js --session`:

```sql
select session_id, min(timestamp) as first_error, count() as errors
from events
where event = '$exception' and timestamp >= now() - interval 1 day
group by session_id order by first_error desc limit 20
```

Who saw a feature flag, and which variant:

```sql
select properties.$feature_flag_response as variant, uniq(person_id) as users
from events
where event = '$feature_flag_called'
  and properties.$feature_flag = 'new-checkout-flow'
  and timestamp >= now() - interval 7 day
group by variant
```

Conversion between two events per person:

```sql
select
  uniqIf(person_id, event = 'signup_started') as started,
  uniqIf(person_id, event = 'signup_completed') as completed
from events
where timestamp >= now() - interval 30 day
```

Slowest pages by 95th percentile load time:

```sql
select
  properties.$pathname as path,
  quantile(0.95)(toFloat(properties.$performance_page_loaded)) as p95_ms,
  count() as views
from events
where event = '$pageview' and timestamp >= now() - interval 7 day
group by path having views > 100 order by p95_ms desc limit 20
```

## Limits

- Results cap at **100 rows** unless the query carries its own `LIMIT`, which
  can go to 50,000.
- **`OFFSET` is rejected with a 400** for personal API keys. Page with a keyset
  on the sort column instead: `timestamp` for `events`, `id` for `persons`.
  Other columns are not indexed for this and will crawl.
  ```sql
  select * from events
  where timestamp > '2026-08-01 12:34:56.789'
  order by timestamp limit 1000
  ```
- **10 seconds of execution time**, 3 concurrent queries per project, 2400
  queries per hour. A query that times out wants a shorter range or fewer
  scanned columns, not a retry.
- `/query/` is for ad-hoc analysis. PostHog rate-limits or rejects traffic that
  looks like a bulk export, and points at batch exports instead.
