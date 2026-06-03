---
name: home-assistant-api
description: Orchestrates access to the Home Assistant REST API for programmatic control of smart home devices. Routes requests to specialized resource files based on task type - authentication, state management, service calls, entity types, or advanced queries. Use when querying entity states, controlling devices, managing automations, or performing system operations. Requires HOME_ASSISTANT_URL and HOME_ASSISTANT_TOKEN environment variables.
metadata:
  version: 2.0
---

# Home Assistant REST API Orchestration Skill

This skill provides structured access to the Home Assistant REST API for building integrations, automating smart home devices, and managing Home Assistant instances programmatically.

## Prerequisites

Ensure these environment variables are set:
- `HOME_ASSISTANT_URL`: Your Home Assistant instance URL (e.g., `https://hass.malazan.xyz`)
- `HOME_ASSISTANT_TOKEN`: Long-lived access token from Home Assistant Profile

If not set, ask the user to create a token at **Profile → Long-Lived Access Tokens** and configure the environment variables via chezmoi.

## Quick Reference: When to Load Which Resource

| Task | Load Resource |
|------|---------------|
| Setting up authentication, understanding API basics, HTTP methods | `references/core-concepts.md` |
| Querying entity states, updating states, monitoring changes | `references/state-management.md` |
| Controlling lights, climate, locks, and other devices | `references/service-reference.md` |
| Understanding light, switch, sensor, climate entity types | `references/entity-types.md` |
| Server-side template queries, complex filters, aggregations | `references/templates.md` |
| System configuration, component discovery, error logs | `references/system-config.md` |
| Complete code examples, client libraries, patterns | `references/examples.md` |

## Orchestration Protocol

### Phase 1: Task Analysis

Identify what the user needs to accomplish:

**Authentication & Setup?**
- Getting started with Home Assistant API
- Creating or managing tokens
- Configuring HTTP clients
→ Load `references/core-concepts.md`

**Query or Monitor State?**
- "What is the temperature in the kitchen?"
- "Is the front door locked?"
- "Get all lights that are on"
- "Monitor entity changes"
→ Load `references/state-management.md`

**Control a Device?**
- "Turn on the kitchen light"
- "Set thermostat to 22°C"
- "Lock the front door"
- "Play music on speaker"
→ Load `references/service-reference.md` (then find entity type in `references/entity-types.md`)

**Understand Entity Types?**
- "What attributes does a climate entity have?"
- "What services are available for locks?"
- "How do I control a media player?"
→ Load `references/entity-types.md`

**Complex Query or Data Aggregation?**
- "Count all lights that are on"
- "Get devices with low battery"
- "Average temperature from all sensors"
- "Conditional logic based on time of day"
→ Load `references/templates.md`

**System Management or Discovery?**
- "What components are loaded?"
- "What services are available?"
- "Check configuration validity"
- "View error logs"
→ Load `references/system-config.md`

**Practical Working Example?**
- Code in Python, Node.js, Bash, curl
- Integration patterns
- Error handling
- Multi-entity operations
→ Load `references/examples.md`

### Phase 2: Endpoint Selection

Use this decision tree to select the right API endpoint:

```
Do you need to...
│
├─ GET INFORMATION?
│ ├─ Get one entity's state? → GET /api/states/{entity_id}
│ ├─ Get all entity states? → GET /api/states (then filter)
│ ├─ Get configuration? → GET /api/config
│ ├─ List available services? → GET /api/services
│ ├─ Discover event types? → GET /api/events
│ ├─ Query historical data? → GET /api/history/period/{timestamp}
│ ├─ Get error log? → GET /api/error_log
│ ├─ Complex query/computation? → POST /api/template
│ └─ Check system status? → GET /api/
│
├─ CONTROL A DEVICE?
│ ├─ Light (on/off/brightness)? → POST /api/services/light/{service}
│ ├─ Switch? → POST /api/services/switch/{service}
│ ├─ Climate/thermostat? → POST /api/services/climate/{service}
│ ├─ Lock? → POST /api/services/lock/{service}
│ ├─ Cover/blinds? → POST /api/services/cover/{service}
│ ├─ Media player? → POST /api/services/media_player/{service}
│ ├─ Fan? → POST /api/services/fan/{service}
│ ├─ Camera? → POST /api/services/camera/{service}
│ └─ Any service? → POST /api/services/{domain}/{service}
│
├─ MODIFY STATE (NOT FOR DEVICE CONTROL)?
│ ├─ Create/update state? → POST /api/states/{entity_id}
│ ├─ Delete state? → DELETE /api/states/{entity_id}
│ └─ Fire custom event? → POST /api/events/{event_type}
│
└─ MANAGE SYSTEM?
  ├─ Validate config? → POST /api/config/core/check_config
  ├─ Reload config? → POST /api/services/homeassistant/reload_core_config
  ├─ Restart Home Assistant? → POST /api/services/homeassistant/restart
  ├─ Get components list? → GET /api/components
  ├─ Update entity metadata? → POST /api/services/homeassistant/update_entity
  └─ Check error log? → GET /api/error_log
```

### Phase 3: Execution & Validation

**Before Calling API:**
1. Do you have correct entity_id? (domain.name format)
2. Are you using the right HTTP method? (GET vs POST vs DELETE)
3. Is your authentication token valid?
4. For service calls, do you have the right parameters?

**During Execution:**
- Handle error responses appropriately (401, 404, 500, etc.)
- Retry on network errors with exponential backoff
- Monitor performance for polling operations

**After Execution:**
- Verify response matches expectation
- Check for error codes in response
- Cache results if applicable

## Helper Scripts

Use these scripts for common operations:

### ha-get-state.sh
Get the state of a single entity.
```bash
./scripts/ha-get-state.sh light.kitchen
```

### ha-set-service.sh
Call a service on an entity.
```bash
./scripts/ha-set-service.sh light turn_on '{"entity_id": "light.kitchen", "brightness": 200}'
```

### ha-query-template.sh
Execute a server-side template query.
```bash
./scripts/ha-query-template.sh "{{ states.light | selectattr('state', 'eq', 'on') | list | length }}"
```

### ha-list-entities.sh
List all entities, optionally filtered by domain.
```bash
./scripts/ha-list-entities.sh light
```

## Common Task Patterns

### Query Current State

```bash
# Get one light's state
curl -H "Authorization: Bearer $HOME_ASSISTANT_TOKEN" \
  -H "Content-Type: application/json" \
  "$HOME_ASSISTANT_URL/api/states/light.kitchen"

# Get temperature reading
curl -H "Authorization: Bearer $HOME_ASSISTANT_TOKEN" \
  -H "Content-Type: application/json" \
  "$HOME_ASSISTANT_URL/api/states/sensor.temperature"

# Get all lights (filter client-side)
curl -H "Authorization: Bearer $HOME_ASSISTANT_TOKEN" \
  -H "Content-Type: application/json" \
  "$HOME_ASSISTANT_URL/api/states" | jq '.[] | select(.entity_id | startswith("light."))'
```

Load: `references/state-management.md` then `references/core-concepts.md` for HTTP details

### Turn on/off Devices

```bash
# Turn on light with brightness
curl -X POST -H "Authorization: Bearer $HOME_ASSISTANT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"entity_id": "light.kitchen", "brightness": 200}' \
  "$HOME_ASSISTANT_URL/api/services/light/turn_on"

# Turn off all lights
curl -X POST -H "Authorization: Bearer $HOME_ASSISTANT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"entity_id": "all"}' \
  "$HOME_ASSISTANT_URL/api/services/light/turn_off"

# Toggle switch
curl -X POST -H "Authorization: Bearer $HOME_ASSISTANT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"entity_id": "switch.coffee_maker"}' \
  "$HOME_ASSISTANT_URL/api/services/switch/toggle"
```

Load: `references/service-reference.md` + `references/entity-types.md` for specific parameters

### Query Multiple Entities

**Option 1: Multiple API calls** (simple, high bandwidth)
```bash
curl -H "Authorization: Bearer $HOME_ASSISTANT_TOKEN" "$HOME_ASSISTANT_URL/api/states/light.kitchen"
curl -H "Authorization: Bearer $HOME_ASSISTANT_TOKEN" "$HOME_ASSISTANT_URL/api/states/light.living_room"
curl -H "Authorization: Bearer $HOME_ASSISTANT_TOKEN" "$HOME_ASSISTANT_URL/api/states/light.bedroom"
```

**Option 2: Get all and filter** (one call, parse locally)
```bash
curl -H "Authorization: Bearer $HOME_ASSISTANT_TOKEN" "$HOME_ASSISTANT_URL/api/states" | \
  jq '[.[] | select(.entity_id | startswith("light."))]'
```

**Option 3: Server-side template** (most efficient)
```bash
curl -X POST -H "Authorization: Bearer $HOME_ASSISTANT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"template": "{{ states.light | selectattr('\''state'\'', '\''eq'\'', '\''on'\'') | list | length }}"}' \
  "$HOME_ASSISTANT_URL/api/template"
```

Load: `references/templates.md` for advanced queries

### Batch Operations

```bash
# Bad: Multiple sequential API calls
curl -X POST ... "$HOME_ASSISTANT_URL/api/services/light/turn_on" -d '{"entity_id": "light.kitchen"}'
curl -X POST ... "$HOME_ASSISTANT_URL/api/services/light/turn_on" -d '{"entity_id": "light.living_room"}'
curl -X POST ... "$HOME_ASSISTANT_URL/api/services/light/turn_on" -d '{"entity_id": "light.bedroom"}'

# Better: Array of entities in one call
curl -X POST -H "Authorization: Bearer $HOME_ASSISTANT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"entity_id": ["light.kitchen", "light.living_room", "light.bedroom"]}' \
  "$HOME_ASSISTANT_URL/api/services/light/turn_on"

# Best: Use Home Assistant script (for complex multi-step)
curl -X POST -H "Authorization: Bearer $HOME_ASSISTANT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"entity_id": "script.my_scene"}' \
  "$HOME_ASSISTANT_URL/api/services/script/turn_on"
```

Load: `references/examples.md` for working code patterns

## Entity Type Quick Reference

### Read-Only (Sensors)
- `sensor.*` - Numeric/text readings
- `binary_sensor.*` - On/off detection
- `camera.*` - Camera snapshots

Load: `references/entity-types.md` for attributes

### Controllable Entities
- `light.*` - Lights (on/off, brightness, color)
- `switch.*` - Switches (on/off)
- `climate.*` - Thermostats (temperature, mode)
- `cover.*` - Blinds, doors (open/close, position)
- `lock.*` - Locks (lock/unlock)
- `fan.*` - Fans (on/off, speed, oscillate)
- `media_player.*` - Media devices (play/pause, volume)

Load: `references/entity-types.md` then `references/service-reference.md` for specific parameters

### Meta Entities (Non-device)
- `automation.*` - Automations (trigger, turn on/off)
- `script.*` - Scripts (turn on/off)
- `scene.*` - Scenes (activate)
- `group.*` - Entity groups
- `person.*` - Location tracking
- `device_tracker.*` - Device tracking
- `input_*` - Input helpers (boolean, number, text, select)

### Status Entities
- `person.*` - "home" or "not_home"
- `device_tracker.*` - Location state
- `sun.sun` - "above_horizon" or "below_horizon"
- `weather.*` - Weather conditions

## Service Call Parameters

### Most Common Services

| Domain | Service | Key Parameters |
|--------|---------|-----------------|
| light | turn_on | entity_id, brightness, rgb_color, transition |
| light | turn_off | entity_id, transition |
| switch | turn_on | entity_id |
| switch | turn_off | entity_id |
| climate | set_temperature | entity_id, temperature, hvac_mode |
| climate | set_hvac_mode | entity_id, hvac_mode |
| cover | open_cover | entity_id |
| cover | set_cover_position | entity_id, position (0-100) |
| lock | lock | entity_id, code (optional) |
| lock | unlock | entity_id, code (optional) |
| fan | turn_on | entity_id, percentage, preset_mode |
| media_player | play_media | entity_id, media_content_id, media_content_type |
| notify | mobile_app_* | message, title, data |
| automation | trigger | entity_id |
| script | turn_on | entity_id |
| scene | turn_on | entity_id, transition |

Load: `references/service-reference.md` for complete reference

## Response Handling

### Success (200)
```json
{
  "entity_id": "light.kitchen",
  "state": "on",
  "attributes": {...},
  "last_changed": "...",
  "last_updated": "...",
  "context": {...}
}
```

### Authorization Error (401)
```json
{
  "error": "Unauthorized",
  "message": "Invalid authentication provided"
}
```
**Solution:** Check token, regenerate if needed

### Not Found (404)
```json
{
  "error": "Entity not found",
  "message": "No entity found for domain 'light' and name 'nonexistent'"
}
```
**Solution:** Verify entity_id exists, check spelling

### Bad Request (400)
```json
{
  "error": "Invalid JSON",
  "message": "..."
}
```
**Solution:** Validate JSON syntax, required fields

### Server Error (500)
**Solution:** Check HA error log, restart if needed

Load: `references/core-concepts.md` for detailed error handling

## Decision Matrix: Which Task?

| I want to... | Load Resource | Example |
|---|---|---|
| Understand how to authenticate | core-concepts.md | Getting access token |
| Query temperature or sensor value | state-management.md | GET /api/states/sensor.temp |
| Turn on a light | service-reference.md → entity-types.md | POST /api/services/light/turn_on |
| Find devices with low battery | templates.md | Server-side template query |
| Understand light color options | entity-types.md | Brightness, RGB, HS color |
| Count how many lights are on | templates.md | selectattr filter |
| Check if config is valid | system-config.md | POST /api/config/core/check_config |
| Write working Python code | examples.md | Complete client implementation |
| Handle errors properly | core-concepts.md → examples.md | Retry logic, error codes |
| Batch control multiple devices | service-reference.md → examples.md | Array of entity_ids |

## Recommended Learning Path

**New to Home Assistant API?**
1. `references/core-concepts.md` - Understand authentication and basics
2. `references/state-management.md` - Learn to query state
3. `references/service-reference.md` - Learn to control devices
4. `references/examples.md` - See working code

**Building an integration?**
1. `references/core-concepts.md` - Error handling, timeouts
2. `references/examples.md` - Client setup, retry logic
3. `references/service-reference.md` - Available operations
4. `references/templates.md` - Complex queries

**Power user optimizations?**
1. `references/templates.md` - Server-side queries
2. `references/system-config.md` - Discovery, caching
3. `references/examples.md` - Performance patterns

---

**Next Step:** Identify your task above, load the appropriate resource file, and proceed with implementation.
