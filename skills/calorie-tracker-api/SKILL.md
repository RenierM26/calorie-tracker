---
name: calorie-tracker-api
description: Use the your-tracker.example.com API to log, edit, delete, and review meal/weight entries for the shared calorie tracker app.
---

# Calorie Tracker API

Use this skill when the user asks to log meals/weight, edit/delete entries, or export/check calorie-tracker data.

## When to use

- "Log this meal for my wife"
- "Add today's weight"
- "Update yesterday's dinner calories"
- "Delete this meal entry"
- "Check recent meals/weights"

## Service details

- Base URL (LAN): `http://localhost:8092`
- Internal app endpoint currently served by container `calorie-tracker` on port `8080`
- API health: `GET /api/health`

## API routes

- `GET /api/meals?limit=2000`
- `POST /api/meals`
- `PUT /api/meals/:id`
- `DELETE /api/meals/:id`
- `GET /api/weights?limit=2000`
- `POST /api/weights`
- `PUT /api/weights/:id`
- `DELETE /api/weights/:id`
- `POST /api/log` (assistant-friendly)

## Data contracts

### Meal payload

```json
{
  "id": "unique-id",
  "date": "YYYY-MM-DD",
  "time": "HH:MM",
  "type": "Breakfast|Lunch|Dinner|Snack|Drink",
  "description": "text",
  "tags": "comma,separated,tags",
  "kg": 0.35,
  "calories": 420
}
```

### Weight payload

```json
{
  "id": "unique-id",
  "date": "YYYY-MM-DD",
  "value": 72.4
}
```

## Natural-language logging shortcut (for agent chats)

When user sends short text like a note, parse it into structured payload and call `POST /api/log`.

### Shortcut intents

1. **Meal log intent** if text includes:

- a meal type keyword (`breakfast|lunch|dinner|snack|drink`), or
- both a quantity (`kg`) and calories (`cal`/`kcal`), or
- food phrase plus calories

2. **Weight log intent** if text includes:

- `weight` keyword and a kg value, or
- `weigh in` + number in kg

### Supported quick examples

- `log dinner chicken pasta 0.35kg 620cal`
- `breakfast oats 0.25kg 340 kcal tags: protein`
- `snack apple 0.18kg 95`
- `drink soda 0.33kg 140 cal tags: sugar`
- `weight 72.4kg`
- `log weight today 72.1`

### Parse rules

- Date defaults to **today** unless explicit date present.
- Time defaults to empty unless explicit time present.
- If meal type missing but food+calories present, default to `Snack` and mention assumption.
- Accept `cal` or `kcal`; store as integer `calories`.
- Accept kg values like `0.35kg` or `0.35 kg`.
- `tags:` section maps to comma-separated `tags`.

### Clarify before write when required

Ask one follow-up question if any required field is missing:

- Meal requires: `type`, `kg`, `calories`
- Weight requires: `value`

### Write action

Use:

```json
POST /api/log
{
  "kind": "meal|weight",
  "payload": { ... }
}
```

### Confirmation reply style

After successful write, confirm in one line:

- Meal: `Logged: Dinner, 0.35 kg, 620 kcal (Chicken pasta) for 2026-03-07.`
- Weight: `Logged weight: 72.4 kg for 2026-03-07.`

## Assistant behavior guidelines

1. Confirm ambiguous details before writing:
   - date/time if not obvious
   - kg and calories for meals
   - value for weight
2. If user says "today"/"now", use local date.
3. For meals with multiple parts (starter/main/dessert/drink), create separate meal entries.
4. Prefer `POST /api/log` for natural assistant workflows.
5. If API token auth is enabled later, include `x-api-token` on write calls.

## Example assistant log call

```json
POST /api/log
{
  "kind": "meal",
  "payload": {
    "id": "id-<timestamp>",
    "date": "2026-03-07",
    "time": "18:30",
    "type": "Dinner",
    "description": "Chicken salad",
    "tags": "starter",
    "kg": 0.35,
    "calories": 420
  }
}
```

## Error handling

- 400: missing/invalid payload fields
- 401: missing/invalid `x-api-token` (if token enabled)
- 404: edit/delete target not found

When write fails, report the reason clearly and ask for corrected values.
