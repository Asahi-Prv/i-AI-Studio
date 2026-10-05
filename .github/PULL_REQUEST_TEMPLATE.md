<!--
  Thanks for contributing! Please keep PRs focused on a single change and fill in
  the sections below. See CONTRIBUTING.md for the full guide.
-->

## Summary

<!-- What does this PR change, and why? -->

## Related issues

<!-- e.g. "Closes #12", "Refs #34" -->

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Refactor / cleanup
- [ ] Documentation
- [ ] Build / CI
- [ ] Localization (en/ja)

## How was this tested?

<!-- Commands you ran, manual steps, screenshots, or a description of the tests added. -->

## Checklist

- [ ] `ruff check .` passes
- [ ] `pytest -q` passes
- [ ] User-facing strings are added to **both** languages (`app/static/i18n.js`, `app/i18n.py`)
- [ ] I did not hardcode user-facing text in `app/static/app.js` or backend handlers
- [ ] `README.md` and `README.ja.md` are updated if behavior changed
- [ ] No secrets (tokens, API keys, passwords) or personal paths are included
- [ ] My changes keep the app local-first (no new listening interfaces by default)
