import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Set cwd to project root so service files resolve data/ correctly
const __dirname = path.dirname(fileURLToPath(import.meta.url))
process.chdir(path.resolve(__dirname, '..', '..', '..'))
