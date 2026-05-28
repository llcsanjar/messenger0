import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read .env from current directory (since envDir is now the frontend directory)
const envPath = path.resolve(__dirname, '.env');

let env = {};
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    // Match line name = value while ignoring comments and whitespace
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      let value = match[2] || '';
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
      env[match[1]] = value.trim();
    }
  });
}

const templatePath = path.resolve(__dirname, 'src/firebase-messaging-sw.template.js');
const outputPath = path.resolve(__dirname, 'public/firebase-messaging-sw.js');

if (fs.existsSync(templatePath)) {
  let template = fs.readFileSync(templatePath, 'utf8');
  const replaced = template
    .replace('__VITE_FIREBASE_API_KEY__', env.VITE_FIREBASE_API_KEY || '')
    .replace('__VITE_FIREBASE_AUTH_DOMAIN__', env.VITE_FIREBASE_AUTH_DOMAIN || '')
    .replace('__VITE_FIREBASE_PROJECT_ID__', env.VITE_FIREBASE_PROJECT_ID || '')
    .replace('__VITE_FIREBASE_STORAGE_BUCKET__', env.VITE_FIREBASE_STORAGE_BUCKET || '')
    .replace('__VITE_FIREBASE_MESSAGING_SENDER_ID__', env.VITE_FIREBASE_MESSAGING_SENDER_ID || '')
    .replace('__VITE_FIREBASE_APP_ID__', env.VITE_FIREBASE_APP_ID || '')
    .replace('__VITE_FIREBASE_MEASUREMENT_ID__', env.VITE_FIREBASE_MEASUREMENT_ID || '');
  
  fs.writeFileSync(outputPath, replaced, 'utf8');
  console.log('Successfully generated public/firebase-messaging-sw.js from template and .env');
} else {
  console.error('Template file not found at:', templatePath);
}
