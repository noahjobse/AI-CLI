import * as fs from 'fs-extra';
import * as path from 'path';
import * as crypto from 'crypto';
import * as os from 'os';
import { Config, expandPath } from './config';

let keytar: any = null;
try {
  keytar = require('keytar');
} catch (error) {
  // keytar not available, will use fallback
}

const SERVICE_NAME = 'ai-cli';
const ACCOUNT_NAME = 'openai-api-key';

export async function getApiKey(config: Config): Promise<string | null> {
  if (config.keyStorage.method === 'keytar' && keytar) {
    try {
      return await keytar.getPassword(SERVICE_NAME, ACCOUNT_NAME);
    } catch (error) {
      console.warn('[warn] Failed to get key from keytar, falling back to local storage');
    }
  }
  
  // Fallback to local encrypted storage
  return await getLocalEncryptedKey(config);
}

export async function setApiKey(apiKey: string, config: Config): Promise<void> {
  if (config.keyStorage.method === 'keytar' && keytar) {
    try {
      await keytar.setPassword(SERVICE_NAME, ACCOUNT_NAME, apiKey);
      return;
    } catch (error) {
      console.warn('[warn] Failed to save key to keytar, falling back to local storage');
    }
  }
  
  // Fallback to local encrypted storage
  await setLocalEncryptedKey(apiKey, config);
}

async function getLocalEncryptedKey(config: Config): Promise<string | null> {
  try {
    const keyPath = expandPath(config.keyStorage.local!.encryptedKeyPath);
    const saltPath = expandPath(config.keyStorage.local!.saltPath);
    const ivPath = expandPath(config.keyStorage.local!.ivPath);
    
    if (!(await fs.pathExists(keyPath)) || 
        !(await fs.pathExists(saltPath)) || 
        !(await fs.pathExists(ivPath))) {
      return null;
    }
    
    const encryptedKey = await fs.readFile(keyPath);
    const salt = await fs.readFile(saltPath);
    const iv = await fs.readFile(ivPath);
    
    const derivedKey = await deriveKey(salt);
    const decipher = crypto.createDecipheriv('aes-256-gcm', derivedKey, iv);
    decipher.setAuthTag(encryptedKey.slice(-16));
    
    const decrypted = Buffer.concat([
      decipher.update(encryptedKey.slice(0, -16)),
      decipher.final()
    ]);
    
    return decrypted.toString('utf8');
  } catch (error) {
    console.warn('[warn] Failed to decrypt local key');
    return null;
  }
}

async function setLocalEncryptedKey(apiKey: string, config: Config): Promise<void> {
  try {
    const keyPath = expandPath(config.keyStorage.local!.encryptedKeyPath);
    const saltPath = expandPath(config.keyStorage.local!.saltPath);
    const ivPath = expandPath(config.keyStorage.local!.ivPath);
    
    await fs.ensureDir(path.dirname(keyPath));
    
    const salt = crypto.randomBytes(32);
    const iv = crypto.randomBytes(16);
    const derivedKey = await deriveKey(salt);
    
    const cipher = crypto.createCipheriv('aes-256-gcm', derivedKey, iv);
    const encrypted = Buffer.concat([
      cipher.update(apiKey, 'utf8'),
      cipher.final()
    ]);
    
    const authTag = cipher.getAuthTag();
    const finalEncrypted = Buffer.concat([encrypted, authTag]);
    
    await fs.writeFile(keyPath, finalEncrypted);
    await fs.writeFile(saltPath, salt);
    await fs.writeFile(ivPath, iv);
  } catch (error) {
    throw new Error(`Failed to encrypt and save key: ${error}`);
  }
}

async function deriveKey(salt: Buffer): Promise<Buffer> {
  const machineId = await getMachineId();
  return new Promise((resolve, reject) => {
    crypto.scrypt(machineId, salt, 32, { N: 32768 }, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

async function getMachineId(): Promise<string> {
  try {
    const { machineId } = await import('node-machine-id');
    return machineId();
  } catch (error) {
    // Fallback to hostname if node-machine-id fails
    return os.hostname();
  }
}


