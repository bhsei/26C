# Meal image matching experiment

This part of the code is used to suggest an existing `Food` catalog entry from a supervisor image. It does not modify the Next.js application, database, or listing flow. A supervisor reviews the match before selecting a food and publishing a listing.

## Model

The chatbot uses Ollama `qwen2:7b`, a text-only model that cannot inspect a photo. We keep Ollama as the local serving layer and use a separate vision model such as `qwen2.5vl:3b`, we also tried `qwen2.5vl:7b`, but its response time takes too long. Pull it separately:

```powershell
ollama pull qwen2.5vl:3b
```

## Try it

Requires Python 3.10+ and Ollama at `http://localhost:11434` (or `OLLAMA_BASE_URL`). The CLI uses only Python's standard library and sends the image to the local Ollama server.

```powershell
python experiments\classify_meal.py path\to\meal.jpg --catalog experiments\catalog.example.json
```

The default is `qwen2.5vl:3b` to reduce inference time. Set `OLLAMA_MODEL=qwen2.5vl:7b` if accuracy matters more and the machine can run it. The model stays loaded for ten minutes after a request to reduce cold-start time on subsequent photos. Set `OLLAMA_BASE_URL` to override the local server URL. Copy the example catalog and replace it with the current Food catalog (`id`, `name`, optional `description`).

## Matching approach

The prompt restricts output to catalog IDs and asks the model to abstain if unclear. A JSON schema limits the response to the selected ID. The CLI validates that ID and prints only the predicted food label and ID (or `No confident match`).

## Limits

- This is a local CLI, not a web upload endpoint or UI.
- The example catalog is not loaded from the app database.
- No labeled photo evaluation has been done; the model may choose the wrong dish. Supervisor confirmation remains necessary.
- Qwen2.5-VL may require a recent Ollama release; consult the model page if unavailable.
