# Deployment follow-up

Keep the working deployment at [lac.kentonbell.workers.dev](https://lac.kentonbell.workers.dev). Start with the latest successful GitHub run and its Cloudflare deployment link to identify which job published the site. Use that job for the next update.

1. **Confirm what works.** Open the live site in a private window and try **Sign in**. If the access-code field appears and you can sign in, go straight to step 4 below. If you still see “School sign-in is unavailable on this deployment,” continue to step 2. If only the Worker health endpoint works, check the deployment link for the actual frontend URL.
2. **Configure the frontend build.** The unavailable message appears when Vite builds the frontend without an API URL. A static assets Worker does not accept runtime variables. Set `VITE_API_URL` to the public origin of the backend Worker. Verify that origin first by opening its `/api/catalog` route and looking for JSON with `services` and `packages`. If `lac.kentonbell.workers.dev` only serves static files, use the URL of the Worker that runs `backend/src/index.ts`.
   - **Cloudflare builds from GitHub:** Open the frontend Worker in Cloudflare, then **Settings → Build → Build variables and secrets**. Add `VITE_API_URL` as a build variable. [Cloudflare build settings](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
   - **GitHub Actions runs the build:** Pass `VITE_API_URL` in the environment of the step that runs the frontend build. If the job is this repository's `Deploy to Cloudflare` Pages workflow, set the repository variable `CF_WORKER_URL` and use its configured production branch. That workflow supplies `VITE_API_URL` on production builds.

   Rebuild and deploy the frontend, then check that the school access code field appears.
3. **Verify sign-in.** Use an existing valid admin code or follow [hosting step 5](hosting.md#5-create-the-first-admin-code-and-sign-in). If the site and API use separate origins and the browser cannot reach the API, check that the Worker's `FRONTEND_ORIGIN` matches the exact public site origin.
4. **Verify the next push.** Confirm that the next push to the intended production branch succeeds in GitHub Actions and updates the same public URL. Open that URL and sign in again to confirm the production build retained its API configuration.

## Keep one automatic deployment

Use **Workers Builds: lac** for the existing Worker site. In Cloudflare, open **lac → Settings → Build → Branch control** and turn off **Enable Preview Builds** if you only want deployments after merges to production. The repository's separate Pages workflow runs on manual dispatch. If GitHub still requires either old preview check, remove that requirement from the production branch's protection rule or ruleset.

## Sign-in shows a red error after submission

Check the frontend build's `VITE_API_URL` before generating another code. It should be a full HTTPS backend origin with no quotes, path, or trailing slash. Open that origin's `/api/catalog` and verify it returns JSON with `services` and `packages`. A site page or a 404 means you need the backend Worker's address. Once you fix the build variable, redeploy and test in a private window. If the backend and frontend are on different origins, the backend's `FRONTEND_ORIGIN` must match the frontend address.
