# Roadmap

Calorie Tracker is meant to stay small, self-hostable, and easy to operate. This roadmap captures likely improvements without turning the project into a large platform.

## Near term

### Better mobile/PWA experience

- Add installable PWA metadata.
- Improve small-screen spacing and form ergonomics.
- Make common logging flows faster on phones.

### Dashboard polish

- Add clearer daily/weekly summaries.
- Improve chart labels and empty states.
- Add simple date-range presets.

### Import/export hardening

- Add more validation details to import dry-runs.
- Improve duplicate/conflict reporting.
- Keep export files stable and easy to inspect by humans.

## Medium term

### Authentication options

The current `API_TOKEN` is lightweight write protection, not a full login system.

Possible future directions:

- reverse-proxy auth documentation/examples
- optional single-user login
- clearer separation between read-only and write access

Any auth work should keep simple LAN deployments simple.

### Backup guidance

- Add example automated export jobs.
- Document SQLite backup/restore patterns more clearly.
- Add restore drills for Docker Compose deployments.

### Assistant integration

- Keep the assistant logging API stable.
- Add more examples for meal/weight logging prompts.
- Consider a stricter machine-readable API reference.

## Later / maybe

- CSV import/export.
- Goal tracking.
- More nutrition fields.
- Multi-person support.
- Better reporting views.

These should only be added if they do not make the app annoying to self-host or maintain.

## Not planned right now

- Cloud sync service.
- Public hosted accounts.
- Complex role-based access control.
- Social/sharing features.
- Large nutrition database integration.

## Project principles

1. Personal data stays local by default.
2. Docker Compose deployment should remain straightforward.
3. Backups and restores should be boring and testable.
4. Screenshots, examples, and fixtures must use synthetic data only.
5. Prefer small, understandable features over broad complexity.
