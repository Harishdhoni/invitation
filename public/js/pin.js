// Editor PINs. A PIN is 8 characters from an alphabet without look-alikes (no 0/O, 1/I), shown as ABCD-EFGH.
// It is the id of a pins/<PIN> document, so it has to be hard to guess: 32^8 ≈ 10^12 possibilities,
// far more than a 4–6 digit PIN, because anyone can try ids against Firestore.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";   // 32 characters, so `byte & 31` picks one without bias
export const PIN_LENGTH = 8;

export function generatePin(){
  return Array.from(crypto.getRandomValues(new Uint8Array(PIN_LENGTH)), b => ALPHABET[b & 31]).join("");
}

export const formatPin = pin => pin.slice(0, PIN_LENGTH / 2) + "-" + pin.slice(PIN_LENGTH / 2);

// What a person typed -> the stored form (case, spaces and dashes don't matter).
export const normalizePin = text => String(text || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

export const isValidPin = pin => new RegExp(`^[A-Z0-9]{${PIN_LENGTH}}$`).test(pin);
