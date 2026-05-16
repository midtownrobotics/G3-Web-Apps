# Annual Handoff

Run this every year after championships. The goal is a new student can own any part of the system within two weeks.

## Timing

Cut the handoff branch the week after championships. Complete within 30 days.

## Steps

### 1. Tag the season

```bash
git tag season-$(date +%Y)-final
git push origin season-$(date +%Y)-final
```

### 2. Audit access

- [ ] Remove graduated students from Cloudflare Zero Trust groups
- [ ] Add new students (mentors sponsor each account)
- [ ] Rotate `CLOUDFLARE_API_TOKEN` in GitHub repo secrets
- [ ] Rotate `TBA_API_KEY` if it was shared externally

### 3. Document what changed this season

For each plugin/module that was added or significantly changed, the outgoing owner writes:
- What it does
- Known issues
- What the incoming owner should tackle first

Update the `README.md` in the relevant plugin/module folder.

### 4. Knowledge transfer sessions

One session per major system area. Incoming student drives, outgoing student watches. Record if possible.

- [ ] Deployment process (wrangler, Pages, GitHub Actions)
- [ ] Database: how to write and apply a migration
- [ ] `workers/api`: how to add a module
- [ ] `apps/web`: how to add a plugin
- [ ] Cloudflare Access: adding/removing users

### 5. Verify the new student can deploy

Pick something small (bump a package, update a README). Have the new student open a PR, get it reviewed, and merge it. Make sure CI passes and the deploy goes out.

### 6. Archive dead code

Any plugin or module that won't be maintained this season: move to `_archive/` with a note explaining what it was and why it was shelved.

## Contacts

| Role | Name | Contact |
|---|---|---|
| Cloudflare account owner | (update each season) | — |
| GitHub org owner | (update each season) | — |
| Mentor sponsor | (update each season) | — |
