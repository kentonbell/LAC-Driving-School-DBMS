# Put L.A.C. Driving School online

Follow these steps in order for a **class demo with fictional data**. You can keep your existing Cloudflare setup. This guide will help you identify which part you already have and add the missing part.

| What it does | Where it lives | What to open |
| --- | --- | --- |
| Shows the website and sign-in screen | Cloudflare **Pages** | The address ending in `.pages.dev` |
| Handles sign-in, bookings, and other app requests | Cloudflare **Worker** | The address ending in `.workers.dev`; add `/health` to test it |
| Stores students, bookings, and packages | **Neon** | The Neon Console, where you run the supplied SQL files |

Your existing Worker is named `lac`. Opening [its root URL](https://lac.kentonbell.workers.dev/) and seeing `{"error":"Route not found."}` is expected because the Worker only serves API endpoints. Open your production `.pages.dev` address for the website. If you don't have a Pages project yet, start at step 1.

Check the existing Worker before redeploying it:

1. Open [Worker health](https://lac.kentonbell.workers.dev/health). Expect `{"status":"ok"}`.
2. Open [Worker catalog](https://lac.kentonbell.workers.dev/api/catalog). Expect JSON with `services` and `packages`. If health works but the catalog fails, check the existing Neon database and Worker secret in steps 2–3.
3. If both checks pass, reuse the existing Worker. Continue at step 4 once your Pages site is available. If you already configured that Pages site and Worker in step 4, continue to step 5 to create an admin code.

**Copy-paste convention:** Blocks labeled **paste as-is** require no edits on your Mac. When Terminal asks you for a value, paste the actual value from the specified screen and press Return. Keep the two Cloudflare addresses handy. Keep the Neon connection string and school access code private.

## 1. Find your existing project and get the public website showing

**If you only see the `lac` Worker, create a separate Pages project.** In the same Cloudflare account, open **Workers & Pages → Create application → Pages → Connect to Git**. Authorize GitHub and select `kentonbell/LAC-Driving-School-DBMS`. Use the settings in **Option B** below, then select **Save and Deploy**. Choose the branch you actually push to if it should publish the public site. After the first **production** deployment succeeds, copy the `.pages.dev` URL from the Pages project's overview. If the deployment fails, open its build log to see why.

With this setup, Cloudflare builds the website when you push to GitHub. **You can skip step 6** if you only want automatic website publishing. Use step 6 later if you also want GitHub Actions to deploy the Worker.

1. Open the [Cloudflare Dashboard](https://dash.cloudflare.com/) and go to **Workers & Pages**. Click your existing project and look at its address and project type.
2. If it is a **Pages** project with a `.pages.dev` address, reuse it. If it is connected to GitHub, use **Option B** below. If it is a Direct Upload project, use **Option A**.
3. If it is a **Worker** with a `.workers.dev` address, leave it in place for now. Use **Option A** to create a separate Pages project. You'll decide whether to reuse the Worker in step 3.

### Option A: Upload the frontend from this Mac

1. Open **Terminal**. Run `node --version`. Use Node 24; if Terminal cannot find Node, install Node 24 from the [Node.js downloads page](https://nodejs.org/en/download), then open Terminal again.
2. **Paste as-is** to build the website and open Finder at the upload folder:

   ```sh
   (cd "/Users/kentonbell/Documents/GitHub/LAC-Driving-School-DBMS/frontend" && npm ci && VITE_API_URL='' npm run build && open -R dist)
   ```

   Wait for the build to finish. Finder should select **dist**. Inside it you should see `index.html`, `assets`, and `brand`.

3. In **Workers & Pages**, open your existing Direct Upload Pages project and choose **Create deployment**. If you don't have a Pages project yet, choose **Create application → Pages → Drag and drop your files**. If Cloudflare opens a Worker creation screen, look for the option to get started with **Pages**.
4. If asked for a project name, enter `lac-driving-school`. If that name is taken, choose an available name. Drag the **dist** folder selected in Finder into the uploader. Choose **Production** if asked, then click **Deploy site**. Upload `dist` only; the source folders and database files are not the website.
5. Open the production address Cloudflare shows. Save the actual `https://…pages.dev` address as your **Pages address**, with no final slash. Don't guess it from the project name.

See [Cloudflare's Pages upload instructions](https://developers.cloudflare.com/pages/get-started/direct-upload/) for the dashboard upload flow.

### Option B: Set up a Pages project connected to GitHub

For a new project, enter these values on the build setup screen. For an existing Pages project, open **Settings → Builds & deployments**:

| Field | Enter |
| --- | --- |
| Production branch | The GitHub branch containing these changes. Enter `main` only if that is where you pushed them. |
| Framework preset | `None` if available; use the explicit settings below |
| Root directory | `frontend` |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Production build variable name and value | `NODE_VERSION` = `24` |

Save the settings. Trigger a new production deployment from that branch; if the dashboard does not offer one, push to the configured branch. Git builds can only see files pushed to GitHub. After a successful build, copy the project's production `https://…pages.dev` address, without a final slash. See [Pages build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/).

**Checkpoint:** The L.A.C. homepage should now open at the Pages address. Sign-in can still say it is unavailable until step 4. If you see the default Worker page, check the address bar for `.pages.dev`.

## 2. Create and set up the database in Neon

You can do all database setup in your browser. You do not need to install PostgreSQL or pgAdmin.

1. Open the [Neon Console](https://console.neon.tech/) and sign in or create an account.
2. Choose **New Project** or **Create Project**. For **Project name**, enter `lac-driving-school-demo`. Keep the default PostgreSQL version and database name if offered. Choose a nearby region if prompted, then create the project.
3. Open that project and click **SQL Editor** in the sidebar. At the top of the editor, note which branch and database are selected. Use the default branch and database for this guide. The database is commonly named `neondb`; use what Neon actually shows.
4. Install the five SQL files below **in order, one file at a time**. Click the first link to open the file locally, press **Command-A** and **Command-C** to copy the full file, then return to Neon. Click inside the SQL Editor, press **Command-A**, and paste over the editor contents. Click **Run**. Wait for it to succeed before copying the next file. If a link doesn't open locally, open the repository's `backend/database` folder in Finder and open the named file in your editor.

   | Order | Open and copy the full contents | What it sets up |
   | --- | --- | --- |
   | 1 | [schema.sql](../backend/database/schema.sql) | Core tables and constraints |
   | 2 | [portal.sql](../backend/database/portal.sql) | Access codes and staff roles |
   | 3 | [workspace.sql](../backend/database/workspace.sql) | Approvals, group sessions, attendance, and payments |
   | 4 | [catalog.sql](../backend/database/catalog.sql) | Lesson services and package prices |
   | 5 | [demo.sql](../backend/database/demo.sql) | Demo populate and empty operations |

   The files above are **paste as-is**. Do not run `seed.sql` for this walkthrough. If you're reusing a database, skip migrations you already ran successfully. If you aren't sure what was installed, use a fresh demo project. If any script errors, stop at that file so you can fix the first error before continuing.

5. In the SQL Editor, replace the previous script with this **paste as-is** check and click **Run**:

   ```sql
   SELECT current_database() AS database,
          (SELECT count(*) FROM service) AS services,
          (SELECT count(*) FROM package) AS package_offers,
          to_regprocedure('seed_demo_data()') IS NOT NULL AS demo_ready;
   ```

   On a new database, expect **9** services, **5** offers, and `demo_ready` = **true**. Students and bookings will be added from the admin page later.

6. In the Neon project dashboard click **Connect**. In the connection dialog, select the **same branch and database** you used in SQL Editor, and the project role offered for that database. Copy the full connection string beginning with `postgresql://`. If Neon shows a command such as `psql 'postgresql://…'`, copy only the URL inside the quotes. Keep its query parameters, such as `sslmode=require`.

   You'll paste this URL at a secret prompt in step 3. It includes a database password, so don't put it into Pages, GitHub, or a chat. See [Neon's SQL Editor guide](https://neon.com/docs/get-started/query-with-neon-sql-editor) and [connection guide](https://neon.com/docs/connect/connect-from-any-app).

## 3. Deploy the API Worker and give it the Neon secret

1. Decide what to enter for the **Worker name**:
   - If the existing Worker is dedicated to this school project and you want to replace its starter code, open it in Cloudflare and copy its **name** from the project title. For example, if its address is `https://lac-api.example-account.workers.dev`, its name is `lac-api`. Enter only the name.
   - If you're unsure what the existing Worker does, use a separate name: enter `lac-driving-school-demo-api`. Wrangler will create it when you deploy.
2. Open Terminal. **Paste as-is**:

   ```sh
   cd "/Users/kentonbell/Documents/GitHub/LAC-Driving-School-DBMS/backend"
   npm ci && npx wrangler login
   ```

   Complete Cloudflare's sign-in in the browser. Use the Cloudflare account where you created the Pages site. Return to Terminal after login finishes.

3. In the **same Terminal tab**, **paste as-is**. The block asks for two values instead of making you edit the command:

   ```sh
   {
     printf 'Paste your full Pages address (https://...pages.dev): '
     read -r lac_pages_url
     printf 'Enter the Worker name (name only): '
     read -r lac_worker_name
     npx wrangler deploy --name "$lac_worker_name" \
       --var "FRONTEND_ORIGIN:${lac_pages_url%/}" \
       --var ENABLE_DEMO_DATA:true
   }
   ```

   For the first prompt, paste the actual production **Pages address** from step 1, including `https://`. For the second, enter the **Worker name** you chose above. If prompted to choose an account, choose the one with your Pages project. After deployment, copy the actual `https://…workers.dev` address that Wrangler prints. That's your **Worker address**.

4. In the same Terminal tab, **paste as-is**:

   ```sh
   npx wrangler secret put DATABASE_URL --name "$lac_worker_name"
   ```

   When Wrangler asks for the secret value, paste the **Neon connection string** from step 2 and press Return. The prompt may hide what you type. If you copied a different value since leaving Neon, go back to **Connect** and copy the connection string again. This command uses the Worker name from the previous block; if you closed that Terminal tab, rerun the prompt for the name before running it.

5. In your browser, open your **Worker address with `/health` appended**. Expect `{"status":"ok"}`. Then replace `/health` with `/api/catalog`. Expect JSON containing services and package offers. The first checks the Worker; the second checks that it can read Neon. If `/api/catalog` returns an unavailable message, check the Worker secret and Neon branch/database before continuing.

See [Wrangler Worker commands](https://developers.cloudflare.com/workers/wrangler/commands/workers/). Gemini is optional; leave it off while setting up. To enable it later, set the Worker's `GEMINI_API_KEY` as a secret and `GEMINI_MODEL` to the exact model ID enabled on your Gemini account.

## 4. Point the website at the API

This is a **second frontend deployment**. The first got the site online. This one tells the sign-in screen which Worker to call.

- **Direct Upload Pages:** In Terminal, **paste as-is**. At the prompt, paste the real **Worker address** from step 3, including `https://`. Leave off `/health`, `/api`, and any other path.

  ```sh
  {
    printf 'Paste your full Worker address (https://...workers.dev): '
    read -r lac_worker_url
    (cd "/Users/kentonbell/Documents/GitHub/LAC-Driving-School-DBMS/frontend" &&
      VITE_API_URL="${lac_worker_url%/}" npm run build && open -R dist)
  }
  ```

  In Cloudflare, open the **same Pages project** from step 1. Choose **Create deployment → Production**, upload the newly built `dist` folder, and deploy. Don't create a second Pages project.

- **Git-connected Pages:** In your existing Pages project's **Settings → Variables and Secrets**, select **Production**. Add a plain text variable named exactly `VITE_API_URL`. Its value is the actual **Worker address** from step 3, including `https://` and excluding any path or trailing slash. Save and trigger a new production build. The website gets this setting when it builds.

**Checkpoint:** Open the production **Pages address** in a private browser window. Click **Sign in**. You should see a **School access code** field. Use the Pages address you passed to the Worker in step 3; other addresses, including Pages preview URLs, are not allowed by that Worker's origin setting.

## 5. Create the first admin code and sign in

1. In Neon SQL Editor, on the same branch and database used by the Worker, check that the access table exists:

   ```sql
   SELECT current_database(), to_regclass('public.portal_access') AS access_table;
   ```

   If `access_table` is blank, apply `backend/database/portal.sql` after the schema. If you already created an admin using the old instructions, the steps below reuse that account if it is active.

2. From the repository root on your Mac, run `bash backend/scripts/bootstrap-demo-admin.sh`. It displays a private code and copies **one SQL statement** to your clipboard.
3. Paste the SQL into Neon and run it. It must return **one row** with a user ID and an expiry. If it returns zero rows, the existing `school-admin` account is inactive or has another role; inspect that account before proceeding. Copy the original 64-character code from Terminal and enter it on the production Pages **Sign in** screen. The code expires after one day.

4. In the admin workspace, open **Demo Data → Populate database**, check the confirmation box, and submit. Open **Students** and look for **Alex Demo**. Open **Staff** and look for **Taylor Demo** and **Morgan Demo**. You can generate separate one-day codes on those records for testing the other dashboards. Follow the [demo walkthrough](demo.md) for the remaining checks.

## If something doesn't work

| What you see | Check this first |
| --- | --- |
| Worker root returns `{"error":"Route not found."}` | This is expected. Check `/health` and `/api/catalog` on the Worker and open the production `.pages.dev` URL for the homepage. |
| Pages URL returns 404 or has no homepage | Check that the latest Pages deployment succeeded and that the build output contained `index.html` at its top level. |
| Homepage works, but there is no access code field | Rebuild and redeploy the frontend from step 4 with `VITE_API_URL` set. Try the production URL in a private window to rule out an older cached app. |
| Worker `/health` works but `/api/catalog` fails | Check that `DATABASE_URL` was added to the exact Worker you opened and that it points to the Neon branch and database where all scripts ran. |
| Access code field is visible but the request cannot reach the portal | Check that Pages was built with the full Worker address and that the Worker's `FRONTEND_ORIGIN` matches the exact Pages origin, without a final slash. |
| Sign-in says to enter a valid school access code | Use the original code printed by Terminal. Check that the SQL from step 5 returned an expiry and ran against the database connected to the Worker. |
| Admin signs in but demo buttons are disabled | Confirm `demo.sql` ran in Neon and the deployed Worker has `ENABLE_DEMO_DATA=true`. |
| Demo populate says people already exist | The demo is already populated or the database has other records. Inspect **Students** and **Staff** first. On the dedicated demo database, **Empty database** clears records but keeps administrator access. |


## 6. Optional: Deploy both Pages and the Worker from GitHub Actions

Use the repository's [Deploy to Cloudflare workflow](../.github/workflows/deploy.yml). Pushes to the production branch deploy the Worker from `backend`, check the Worker and its database connection, and publish the website from `frontend/dist`. Other branch pushes publish website previews with live sign-in disabled. For example, use `Kenton` as the production branch only if that is the branch you intend to publish; otherwise merge into `main`.

1. In Cloudflare Pages, confirm the production branch. Set the same branch in GitHub below. On a Git-integrated Pages project, disable automatic production **and** preview builds in Cloudflare so GitHub Actions is the only publisher. Keep the existing Pages project and URL. If the Worker has its own automatic Git deploy, disable that too. See [Pages Git integration](https://developers.cloudflare.com/pages/get-started/git-integration/).
2. In Cloudflare, create an API token limited to the account hosting both projects, with **Account → Cloudflare Pages → Edit** and **Account → Workers Scripts → Edit**. In GitHub, open **Settings → Secrets and variables → Actions** and create the repository secret `CLOUDFLARE_API_TOKEN`.
3. In the same GitHub settings, under **Variables**, add:

   | Variable | Value |
   | --- | --- |
   | `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID |
   | `CF_PAGES_PROJECT` | Existing Pages project name |
   | `CF_PAGES_URL` | Production Pages origin, including `https://` |
   | `CF_WORKER_NAME` | Existing Worker name |
   | `CF_WORKER_URL` | Worker origin, including `https://` |
   | `CF_PRODUCTION_BRANCH` | Same production branch as Pages; defaults to the GitHub default branch |
   | `CF_ENABLE_DEMO_DATA` | `true` for a dedicated fictional demo database only; defaults to `false` |

   Keep `DATABASE_URL` in the existing Cloudflare Worker secret from step 3. The workflow does not run SQL or need Neon credentials.
4. Commit and push the project changes, including the workflow and the renamed directories, then open GitHub **Actions → Deploy to Cloudflare** to check the run. Open the production Pages URL and test sign-in after it succeeds.
