export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_REGEX = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/;

export function generateRoomCode(): string {
  let code = '';
  const bytes = new Uint8Array(4);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
    for (let i = 0; i < 4; i++) {
      code += ROOM_CODE_ALPHABET[bytes[i] % ROOM_CODE_ALPHABET.length];
    }
  } else {
    for (let i = 0; i < 4; i++) {
      code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
    }
  }
  return code;
}

export function isValidRoomCode(code: string): boolean {
  return CODE_REGEX.test(code.toUpperCase());
}
