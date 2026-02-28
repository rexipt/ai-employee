# npm Release Checklist

## Pre-release

- [ ] `npm ci`
- [ ] `npm run build`
- [ ] `npm run test`
- [ ] `npm run pack:check`
- [ ] Verify `CHANGELOG.md` and `README.md`
- [ ] Confirm `package.json` version is correct

## Publish

- [ ] `npm run release:dry-run`
- [ ] `npm login`
- [ ] `npm run release:publish`
- [ ] Create git tag (`vX.Y.Z`)

## Post-release

- [ ] Validate install from npm in clean directory
- [ ] `npx @rexipt/ai-employee init`
- [ ] `npx @rexipt/ai-employee doctor`
- [ ] Run `run-all` smoke check
