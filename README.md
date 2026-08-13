# Movie Map Browser

A pan/zoom map-style browser for a DVD collection stored in Airtable.
Categories cluster titles into nodes; switching category regenerates the
same collection into a new layout. Zoom in to decluster a node into
individual titles.

## Before you push to GitHub

Nothing to change in the code itself, the Airtable connection is entirely
handled through Vercel's environment variables (see below), never hardcoded.

## Setting up Vercel

1. Push this folder to the GitHub repo you created.
2. In Vercel, import that repo.
3. In the project's Settings -> Environment Variables, add:

   | Name | Value |
   |---|---|
   | `AIRTABLE_TOKEN` | your personal access token |
   | `AIRTABLE_BASE_ID` | the base ID (starts with `app...`, found in Airtable's API docs for your base, or in the base URL) |
   | `AIRTABLE_TABLE_NAME` | the exact name of your table, e.g. `Movies` |

4. Redeploy (Vercel does this automatically after saving new env vars, or
   trigger it manually from the dashboard).

## If titles don't show up correctly

Open `index.html` and check the `TITLE_FIELD_CANDIDATES` array near the top
of the script. It guesses your title field is called `Name`, `Title`,
`Movie`, or `Movie Title`. Add your actual field name to the front of that
list if none of those match.

## How clustering fields are chosen

The frontend looks at every text field in your Airtable records and treats
any field that isn't wildly unique per-record (i.e. not just another title)
as a valid clustering option. Add a new single-select field in Airtable
(e.g. "so bad it's good") and it becomes browsable automatically, no code
changes needed.

## Known rough edges (fine for a first version)

- Zoom centers on the middle of the screen, not your fingers.
- Cluster layout is a simple grid, not a force layout.
- The decluster threshold is one fixed zoom level for every category.
